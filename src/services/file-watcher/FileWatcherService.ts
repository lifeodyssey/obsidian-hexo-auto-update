// File Watcher Service with RxJS Implementation

import { watch, FSWatcher, Stats } from 'fs';
import { stat } from 'fs/promises';
import { join, extname } from 'path';
import { 
  Observable, 
  Subject, 
  merge, 
  EMPTY,
  timer
} from 'rxjs';
import { 
  debounceTime, 
  filter, 
  map, 
  catchError, 
  retry,
  share,
  takeUntil,
  distinctUntilChanged,
  switchMap
} from 'rxjs/operators';

import { 
  FileChangeEvent, 
  WatchOptions, 
  Disposable 
} from '../../core/types';
import { IFileWatcherService } from '../../core/tokens';
import { globalLogger } from '../../core/logging';

export class FileWatcherService implements IFileWatcherService, Disposable {
  private watchers = new Map<string, FSWatcher>();
  private subjects = new Map<string, Subject<FileChangeEvent>>();
  private disposeSubject = new Subject<void>();
  private isDisposed = false;

  constructor(
    private defaultDebounceMs: number = 300,
    private retryAttempts: number = 3,
    private retryDelayMs: number = 1000
  ) {}

  /**
   * Watch a single directory or file
   * @param path Path to watch
   * @param options Watch options
   * @returns Observable of file change events
   */
  watch(path: string, options: WatchOptions = {}): Observable<FileChangeEvent> {
    if (this.isDisposed) {
      return EMPTY;
    }

    const watchKey = this.getWatchKey(path, options);
    
    // Return existing observable if already watching this path
    if (this.subjects.has(watchKey)) {
      return this.subjects.get(watchKey)!.asObservable().pipe(
        takeUntil(this.disposeSubject)
      );
    }

    const subject = new Subject<FileChangeEvent>();
    this.subjects.set(watchKey, subject);

    try {
      const watcher = this.createWatcher(path, options, subject);
      this.watchers.set(watchKey, watcher);

      const observable = subject.asObservable().pipe(
        // Apply debouncing
        debounceTime(options.debounceMs || this.defaultDebounceMs),
        // Filter based on options
        filter(event => this.shouldProcessEvent(event, options)),
        // Add metadata
        switchMap(event => this.enrichEvent(event)),
        // Handle errors with retry
        retry(this.retryAttempts),
        // Share the observable
        share(),
        // Take until dispose
        takeUntil(this.disposeSubject),
        // Catch and log errors
        catchError(error => {
          globalLogger.error(`File watcher error for ${path}`, error);
          return EMPTY;
        })
      );

      return observable;

    } catch (error) {
      globalLogger.error(`Failed to create file watcher for ${path}`, error);
      subject.error(error);
      return EMPTY;
    }
  }

  /**
   * Watch multiple paths
   * @param paths Paths to watch
   * @param options Watch options
   * @returns Observable of file change events
   */
  watchMultiple(paths: string[], options: WatchOptions = {}): Observable<FileChangeEvent> {
    if (this.isDisposed) {
      return EMPTY;
    }

    const observables = paths.map(path => this.watch(path, options));
    return merge(...observables).pipe(
      distinctUntilChanged((a, b) => 
        a.path === b.path && a.type === b.type && 
        Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) < 100
      )
    );
  }

  /**
   * Stop watching a specific path
   * @param path Path to stop watching
   * @param options Watch options used when starting
   */
  stopWatching(path: string, options: WatchOptions = {}): void {
    const watchKey = this.getWatchKey(path, options);
    
    const watcher = this.watchers.get(watchKey);
    if (watcher) {
      watcher.close();
      this.watchers.delete(watchKey);
    }

    const subject = this.subjects.get(watchKey);
    if (subject) {
      subject.complete();
      this.subjects.delete(watchKey);
    }
  }

  /**
   * Get currently watched paths
   * @returns Array of watched paths
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Check if a path is being watched
   * @param path Path to check
   * @param options Watch options
   * @returns True if path is being watched
   */
  isWatching(path: string, options: WatchOptions = {}): boolean {
    const watchKey = this.getWatchKey(path, options);
    return this.watchers.has(watchKey);
  }

  /**
   * Dispose all watchers and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    
    // Signal all observables to complete
    this.disposeSubject.next();
    this.disposeSubject.complete();

    // Close all watchers
    for (const [key, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        globalLogger.error(`Error closing watcher for ${key}`, error);
      }
    }

    // Complete all subjects
    for (const [key, subject] of this.subjects) {
      try {
        subject.complete();
      } catch (error) {
        globalLogger.error(`Error completing subject for ${key}`, error);
      }
    }

    // Clear collections
    this.watchers.clear();
    this.subjects.clear();
  }

  /**
   * Create a file system watcher
   * @param path Path to watch
   * @param options Watch options
   * @param subject Subject to emit events to
   * @returns FSWatcher instance
   */
  private createWatcher(
    path: string, 
    options: WatchOptions, 
    subject: Subject<FileChangeEvent>
  ): FSWatcher {
    const watchOptions = {
      recursive: options.recursive !== false,
      persistent: options.persistent !== false
    };

    const watcher = watch(path, watchOptions, (eventType, filename) => {
      if (filename) {
        try {
          const fullPath = join(path, filename);
          const event: FileChangeEvent = {
            type: this.mapEventType(eventType),
            path: fullPath,
            timestamp: new Date()
          };

          subject.next(event);
        } catch (error) {
          globalLogger.error(`Error processing file event for ${filename}`, error);
        }
      }
    });

    watcher.on('error', (error) => {
      globalLogger.error(`File watcher error for ${path}`, error);
      subject.error(error);
    });

    return watcher;
  }

  /**
   * Map native file system event types to our event types
   * @param eventType Native event type
   * @returns Mapped event type
   */
  private mapEventType(eventType: string): FileChangeEvent['type'] {
    switch (eventType) {
      case 'rename':
        return 'created'; // Note: 'rename' can be create, delete, or move
      case 'change':
        return 'modified';
      default:
        return 'modified';
    }
  }

  /**
   * Check if an event should be processed based on options
   * @param event File change event
   * @param options Watch options
   * @returns True if should process
   */
  private shouldProcessEvent(event: FileChangeEvent, options: WatchOptions): boolean {
    // Check file extension filter
    if (options.extensions && options.extensions.length > 0) {
      const ext = extname(event.path).toLowerCase();
      if (!options.extensions.includes(ext)) {
        return false;
      }
    }

    // Check ignored patterns
    if (options.ignored && options.ignored.length > 0) {
      const fileName = event.path.toLowerCase();
      for (const pattern of options.ignored) {
        if (fileName.includes(pattern.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Enrich event with additional metadata
   * @param event File change event
   * @returns Promise resolving to enriched event
   */
  private async enrichEvent(event: FileChangeEvent): Promise<FileChangeEvent> {
    try {
      const stats = await stat(event.path);
      
      return {
        ...event,
        metadata: {
          size: stats.size,
          mtime: stats.mtime
        }
      };
    } catch (error) {
      // File might have been deleted or is not accessible
      // Return original event without metadata
      return event;
    }
  }

  /**
   * Generate a unique key for a watch configuration
   * @param path Path being watched
   * @param options Watch options
   * @returns Unique watch key
   */
  private getWatchKey(path: string, options: WatchOptions): string {
    const optionsKey = JSON.stringify({
      extensions: options.extensions?.sort(),
      ignored: options.ignored?.sort(),
      recursive: options.recursive,
      persistent: options.persistent
    });
    
    return `${path}:${optionsKey}`;
  }
}

/**
 * File watcher service builder for fluent configuration
 */
export class FileWatcherServiceBuilder {
  private debounceMs = 300;
  private retryAttempts = 3;
  private retryDelayMs = 1000;

  /**
   * Set debounce time
   * @param ms Debounce time in milliseconds
   * @returns Builder instance
   */
  withDebounce(ms: number): FileWatcherServiceBuilder {
    this.debounceMs = ms;
    return this;
  }

  /**
   * Set retry attempts
   * @param attempts Number of retry attempts
   * @returns Builder instance
   */
  withRetryAttempts(attempts: number): FileWatcherServiceBuilder {
    this.retryAttempts = attempts;
    return this;
  }

  /**
   * Set retry delay
   * @param ms Retry delay in milliseconds
   * @returns Builder instance
   */
  withRetryDelay(ms: number): FileWatcherServiceBuilder {
    this.retryDelayMs = ms;
    return this;
  }

  /**
   * Build file watcher service
   * @returns File watcher service instance
   */
  build(): FileWatcherService {
    return new FileWatcherService(
      this.debounceMs,
      this.retryAttempts,
      this.retryDelayMs
    );
  }
}

/**
 * Create file watcher service with default configuration
 * @returns File watcher service instance
 */
export function createFileWatcherService(): FileWatcherService {
  return new FileWatcherService();
}

/**
 * Create file watcher service builder
 * @returns File watcher service builder
 */
export function fileWatcherServiceBuilder(): FileWatcherServiceBuilder {
  return new FileWatcherServiceBuilder();
}

/**
 * Common watch options presets
 */
export const WatchPresets = {
  /**
   * Watch markdown files only
   */
  markdown: {
    extensions: ['.md', '.markdown'],
    recursive: true,
    persistent: true
  } as WatchOptions,

  /**
   * Watch all text files
   */
  text: {
    extensions: ['.md', '.txt', '.json', '.yaml', '.yml'],
    recursive: true,
    persistent: true
  } as WatchOptions,

  /**
   * Watch with common ignores
   */
  withCommonIgnores: {
    ignored: [
      '.git',
      'node_modules',
      '.DS_Store',
      'thumbs.db',
      '.tmp',
      '.cache'
    ],
    recursive: true,
    persistent: true
  } as WatchOptions
};