import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
import { Stats } from 'fs';
import picomatch from 'picomatch';

/**
 * Modern, memory-safe file watcher using chokidar
 * Addresses Issue #2 - Memory leaks and thread problems
 */

export interface FileChangeEvent {
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
    path: string;
    timestamp: Date;
    stats?: {
        size: number;
        mtime: Date;
    };
}

export interface WatchOptions {
    ignore?: string[];
    ignoreInitial?: boolean;
    persistent?: boolean;
    followSymlinks?: boolean;
    depth?: number;
    interval?: number;
    binaryInterval?: number;
}

export type FileWatchCallback = (event: FileChangeEvent) => void | Promise<void>;

export class FileWatcherV2 extends EventEmitter {
    private watchers = new Map<string, FSWatcher>();
    private callbacks = new Map<string, Set<FileWatchCallback>>();
    private isDisposed = false;
    private debounceTimers = new Map<string, { timer: NodeJS.Timeout; watchPath: string }>();
    private readyPromises = new Map<string, Promise<void>>();
    private debounceMs: number;
    private cancelReady = new Map<string, () => void>();
    private callbackQueue: Promise<void> = Promise.resolve();
    private disposePromise?: Promise<void>;

    constructor(debounceMs: number = 300) {
        super();
        this.debounceMs = debounceMs;
        
        // Prevent memory leaks from event listeners
        this.setMaxListeners(20);
    }

    /**
     * Watch a directory for changes
     * @param watchPath Path to watch
     * @param callback Callback function for file changes
     * @param options Watch options
     * @returns Unwatch function
     */
    watch(
        watchPath: string, 
        callback: FileWatchCallback, 
        options: WatchOptions = {}
    ): () => Promise<void> {
        if (this.isDisposed) {
            throw new Error('FileWatcher is disposed');
        }

        const normalizedPath = path.resolve(watchPath);
        
        // Initialize callback set for this path
        if (!this.callbacks.has(normalizedPath)) {
            this.callbacks.set(normalizedPath, new Set());
        }
        
        const callbackSet = this.callbacks.get(normalizedPath)!;
        callbackSet.add(callback);

        // Create watcher if it doesn't exist
        if (!this.watchers.has(normalizedPath)) {
            try {
                this.createWatcher(normalizedPath, options);
            } catch (error) {
                this.callbacks.delete(normalizedPath);
                throw error;
            }
        }

        // Return unwatch function
        return async () => {
            if (this.callbacks.get(normalizedPath) !== callbackSet) return;
            callbackSet.delete(callback);
            
            // If no more callbacks for this path, stop watching
            if (callbackSet.size === 0) {
                await this.stopWatching(normalizedPath);
            }
        };
    }

    /**
     * Create a chokidar watcher for the given path
     */
    private createWatcher(watchPath: string, options: WatchOptions): void {
        const ignored = picomatch([
            '**/node_modules/**', '**/.git/**', '**/.obsidian/**',
            '**/.DS_Store', '**/Thumbs.db', '**/*.{tmp,swp,swo,bak}',
            ...(options.ignore || [])
        ], { dot: true });
        const chokidarOptions = {
            ignored: (file: string) => {
                const relative = path.relative(watchPath, file).split(path.sep).join('/');
                return ignored(relative) || ignored(path.basename(file));
            },
            ignoreInitial: options.ignoreInitial ?? true,
            persistent: options.persistent ?? true,
            followSymlinks: options.followSymlinks ?? false,
            depth: options.depth,
            interval: options.interval,
            binaryInterval: options.binaryInterval,
            
            // Performance optimizations
            usePolling: false,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 50
            },
            
            // Prevent excessive events
            atomic: true
        };

        try {
            const watcher = chokidar.watch(watchPath, chokidarOptions);
            
            // Set up event handlers
            const ready = new Promise<void>((resolve, reject) => {
                const cleanup = () => {
                    watcher.removeListener('ready', onReady);
                    watcher.removeListener('error', onError);
                    this.cancelReady.delete(watchPath);
                };
                const onReady = () => { cleanup(); resolve(); };
                const onError = (error: unknown) => { cleanup(); reject(error); };
                this.cancelReady.set(watchPath, () => onError(new Error('Watcher stopped before ready')));
                watcher.once('ready', onReady);
                watcher.once('error', onError);
            });
            // Avoid an unhandled rejection before the caller requests ready().
            ready.catch(() => undefined);
            this.readyPromises.set(watchPath, ready);
            this.setupWatcherEvents(watcher, watchPath);
            
            // Store watcher
            this.watchers.set(watchPath, watcher);
            
            console.log(`File watcher created for: ${watchPath}`);
            
        } catch (error) {
            console.error(`Failed to create file watcher for ${watchPath}:`, error);
            this.emit('watcherError', error, watchPath);
            throw error;
        }
    }

    /**
     * Set up event handlers for a chokidar watcher
     */
    private setupWatcherEvents(watcher: FSWatcher, watchPath: string): void {
        // File/directory added
        watcher.on('add', (filePath, stats) => {
            if (this.isDisposed || this.watchers.get(watchPath) !== watcher) return;
            this.handleFileEvent('add', filePath, watchPath, stats);
        });

        // File changed
        watcher.on('change', (filePath, stats) => {
            if (this.isDisposed || this.watchers.get(watchPath) !== watcher) return;
            this.handleFileEvent('change', filePath, watchPath, stats);
        });

        // File removed
        watcher.on('unlink', (filePath) => {
            if (this.isDisposed || this.watchers.get(watchPath) !== watcher) return;
            this.handleFileEvent('unlink', filePath, watchPath);
        });

        // Directory added
        watcher.on('addDir', (dirPath, stats) => {
            if (this.isDisposed || this.watchers.get(watchPath) !== watcher) return;
            this.handleFileEvent('addDir', dirPath, watchPath, stats);
        });

        // Directory removed
        watcher.on('unlinkDir', (dirPath) => {
            if (this.isDisposed || this.watchers.get(watchPath) !== watcher) return;
            this.handleFileEvent('unlinkDir', dirPath, watchPath);
        });

        // Error handling
        watcher.on('error', (error) => {
            console.error(`File watcher error for ${watchPath}:`, error);
            this.emit('watcherError', error, watchPath);
            if (this.watchers.get(watchPath) !== watcher) return;
            void this.stopWatching(watchPath).catch(closeError => {
                this.emit('watcherError', closeError, watchPath);
            });
        });

        // Ready event
        watcher.on('ready', () => {
            if (this.isDisposed || this.watchers.get(watchPath) !== watcher) return;
            console.log(`File watcher ready for: ${watchPath}`);
            this.emit('ready', watchPath);
        });
    }

    /**
     * Handle file system events with debouncing
     */
    private handleFileEvent(
        type: FileChangeEvent['type'], 
        filePath: string, 
        watchPath: string, 
        stats?: Stats
    ): void {
        // Create debounce key
        const debounceKey = `${watchPath}:${filePath}`;
        
        // Clear existing timer
        const existingTimer = this.debounceTimers.get(debounceKey);
        if (existingTimer) {
            clearTimeout(existingTimer.timer);
        }
        
        // Set new timer
        const timer = setTimeout(() => {
            this.debounceTimers.delete(debounceKey);
            this.processFileEvent(type, filePath, watchPath, stats);
        }, this.debounceMs);
        
        this.debounceTimers.set(debounceKey, { timer, watchPath });
    }

    /**
     * Process file event and notify callbacks
     */
    private processFileEvent(
        type: FileChangeEvent['type'], 
        filePath: string, 
        watchPath: string, 
        stats?: Stats
    ): void {
        const event: FileChangeEvent = {
            type,
            path: filePath,
            timestamp: new Date(),
            stats: stats ? {
                size: stats.size || 0,
                mtime: stats.mtime || new Date()
            } : undefined
        };

        // Get callbacks for this watch path
        const callbacks = this.callbacks.get(watchPath);
        if (!callbacks) return;

        // Serialize callbacks, including across paths. Never start queued work after
        // unwatch/re-watch: the callback set also acts as a generation token.
        const registered = Array.from(callbacks);
        this.callbackQueue = this.callbackQueue.then(async () => {
            const active = () => !this.isDisposed && this.callbacks.get(watchPath) === callbacks;
            for (const callback of registered) {
                if (!active()) return;
                if (!callbacks.has(callback)) continue;
                try {
                    await callback(event);
                } catch (error) {
                    this.emit('callbackError', error, event);
                }
            }
            if (active()) this.emit('fileChange', event);
        }).catch(error => {
            // A consumer event listener must not poison the queue or leak a rejection.
            console.error('File watch listener error:', error);
        });
    }

    /**
     * Stop watching a specific path
     */
    private async stopWatching(watchPath: string): Promise<void> {
        const watcher = this.watchers.get(watchPath);
        this.watchers.delete(watchPath);
        this.callbacks.delete(watchPath);
        this.cancelReady.get(watchPath)?.();
        this.readyPromises.delete(watchPath);
        for (const [key, pending] of this.debounceTimers.entries()) {
            if (pending.watchPath === watchPath) {
                clearTimeout(pending.timer);
                this.debounceTimers.delete(key);
            }
        }
        if (watcher) await watcher.close();
    }

    async ready(watchPath: string): Promise<void> {
        const ready = this.readyPromises.get(path.resolve(watchPath));
        if (!ready) throw new Error('Path is not watched');
        await ready;
    }

    /**
     * Get list of currently watched paths
     */
    getWatchedPaths(): string[] {
        return Array.from(this.watchers.keys());
    }

    /**
     * Check if a path is being watched
     */
    isWatching(watchPath: string): boolean {
        return this.watchers.has(path.resolve(watchPath));
    }

    /**
     * Get watch statistics
     */
    getStats(): {
        watchedPaths: number;
        activeCallbacks: number;
        pendingDebounces: number;
    } {
        let totalCallbacks = 0;
        for (const callbacks of this.callbacks.values()) {
            totalCallbacks += callbacks.size;
        }

        return {
            watchedPaths: this.watchers.size,
            activeCallbacks: totalCallbacks,
            pendingDebounces: this.debounceTimers.size
        };
    }

    /**
     * Dispose all watchers and clean up resources
     */
    dispose(): Promise<void> {
        if (this.disposePromise) return this.disposePromise;
        this.isDisposed = true;
        // Invalidate callbacks and readiness synchronously before waiting on close.
        const closes = Array.from(this.watchers.keys()).map(watchPath => this.stopWatching(watchPath));
        this.disposePromise = Promise.allSettled(closes).then(results => {
            this.removeAllListeners();
            const failed = results.find(result => result.status === 'rejected');
            if (failed?.status === 'rejected') throw failed.reason;
        });
        return this.disposePromise;
    }
}

/**
 * Utility function to create a file watcher with markdown file filtering
 */
export function createMarkdownWatcher(
    watchPath: string, 
    callback: FileWatchCallback,
    options: WatchOptions = {}
): FileWatcherV2 {
    const watcher = new FileWatcherV2();
    
    // Wrap callback to filter markdown files
    const markdownCallback: FileWatchCallback = (event) => {
        if (event.path.endsWith('.md') || event.path.endsWith('.markdown')) {
            return callback(event);
        }
    };
    
    watcher.watch(watchPath, markdownCallback, {
        ...options,
        ignore: [
            ...(options.ignore || []),
            '**/*.{tmp,swp,swo,bak}',
            '**/.*'
        ]
    });
    
    return watcher;
}

/**
 * Utility function to create a watcher for Hexo posts directory
 */
export function createHexoPostsWatcher(
    hexoPath: string, 
    callback: FileWatchCallback,
    options: WatchOptions = {}
): FileWatcherV2 {
    const postsPath = path.join(hexoPath, 'source', '_posts');
    return createMarkdownWatcher(postsPath, callback, options);
}