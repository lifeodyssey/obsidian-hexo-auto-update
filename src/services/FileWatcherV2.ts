import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

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
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private debounceMs: number;

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
    ): () => void {
        if (this.isDisposed) {
            throw new Error('FileWatcher is disposed');
        }

        const normalizedPath = path.normalize(watchPath);
        
        // Initialize callback set for this path
        if (!this.callbacks.has(normalizedPath)) {
            this.callbacks.set(normalizedPath, new Set());
        }
        
        const callbackSet = this.callbacks.get(normalizedPath)!;
        callbackSet.add(callback);

        // Create watcher if it doesn't exist
        if (!this.watchers.has(normalizedPath)) {
            this.createWatcher(normalizedPath, options);
        }

        // Return unwatch function
        return () => {
            callbackSet.delete(callback);
            
            // If no more callbacks for this path, stop watching
            if (callbackSet.size === 0) {
                this.stopWatching(normalizedPath);
            }
        };
    }

    /**
     * Create a chokidar watcher for the given path
     */
    private createWatcher(watchPath: string, options: WatchOptions): void {
        const chokidarOptions = {
            ignored: options.ignore || [
                '**/node_modules/**',
                '**/.git/**',
                '**/.DS_Store',
                '**/Thumbs.db',
                '**/*.tmp',
                '**/.obsidian/**'
            ],
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
            this.setupWatcherEvents(watcher, watchPath);
            
            // Store watcher
            this.watchers.set(watchPath, watcher);
            
            console.log(`File watcher created for: ${watchPath}`);
            
        } catch (error) {
            console.error(`Failed to create file watcher for ${watchPath}:`, error);
            this.emit('error', error);
        }
    }

    /**
     * Set up event handlers for a chokidar watcher
     */
    private setupWatcherEvents(watcher: FSWatcher, watchPath: string): void {
        // File/directory added
        watcher.on('add', (filePath, stats) => {
            this.handleFileEvent('add', filePath, watchPath, stats);
        });

        // File changed
        watcher.on('change', (filePath, stats) => {
            this.handleFileEvent('change', filePath, watchPath, stats);
        });

        // File removed
        watcher.on('unlink', (filePath) => {
            this.handleFileEvent('unlink', filePath, watchPath);
        });

        // Directory added
        watcher.on('addDir', (dirPath, stats) => {
            this.handleFileEvent('addDir', dirPath, watchPath, stats);
        });

        // Directory removed
        watcher.on('unlinkDir', (dirPath) => {
            this.handleFileEvent('unlinkDir', dirPath, watchPath);
        });

        // Error handling
        watcher.on('error', (error) => {
            console.error(`File watcher error for ${watchPath}:`, error);
            this.emit('error', error);
        });

        // Ready event
        watcher.on('ready', () => {
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
        stats?: any
    ): void {
        // Create debounce key
        const debounceKey = `${type}:${filePath}`;
        
        // Clear existing timer
        const existingTimer = this.debounceTimers.get(debounceKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        // Set new timer
        const timer = setTimeout(() => {
            this.debounceTimers.delete(debounceKey);
            this.processFileEvent(type, filePath, watchPath, stats);
        }, this.debounceMs);
        
        this.debounceTimers.set(debounceKey, timer);
    }

    /**
     * Process file event and notify callbacks
     */
    private processFileEvent(
        type: FileChangeEvent['type'], 
        filePath: string, 
        watchPath: string, 
        stats?: any
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

        // Call all callbacks
        for (const callback of callbacks) {
            try {
                const result = callback(event);
                
                // Handle async callbacks
                if (result instanceof Promise) {
                    result.catch(error => {
                        console.error('File watch callback error:', error);
                        this.emit('callbackError', error, event);
                    });
                }
            } catch (error) {
                console.error('File watch callback error:', error);
                this.emit('callbackError', error, event);
            }
        }

        // Emit event for general listeners
        this.emit('fileChange', event);
    }

    /**
     * Stop watching a specific path
     */
    private stopWatching(watchPath: string): void {
        const watcher = this.watchers.get(watchPath);
        if (watcher) {
            watcher.close().then(() => {
                console.log(`File watcher closed for: ${watchPath}`);
            }).catch(error => {
                console.error(`Error closing file watcher for ${watchPath}:`, error);
            });
            
            this.watchers.delete(watchPath);
        }
        
        this.callbacks.delete(watchPath);
        
        // Clear any pending debounce timers for this path
        for (const [key, timer] of this.debounceTimers.entries()) {
            if (key.includes(watchPath)) {
                clearTimeout(timer);
                this.debounceTimers.delete(key);
            }
        }
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
        return this.watchers.has(path.normalize(watchPath));
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
    async dispose(): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;

        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Close all watchers
        const closePromises = Array.from(this.watchers.entries()).map(([path, watcher]) => {
            return watcher.close().catch(error => {
                console.error(`Error closing watcher for ${path}:`, error);
            });
        });

        await Promise.all(closePromises);

        // Clear collections
        this.watchers.clear();
        this.callbacks.clear();

        // Remove all event listeners
        this.removeAllListeners();

        console.log('FileWatcher disposed successfully');
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