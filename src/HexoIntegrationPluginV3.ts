import { Notice, Plugin } from "obsidian";
import path from "path";

// Modern services
import { SymlinkServiceV2 } from "./services/SymlinkServiceV2";
import { FileWatcherV2, FileChangeEvent } from "./services/FileWatcherV2";
import { FileScannerV2 } from "./services/FileScannerV2";
import { FrontMatterProcessorV2, createHexoFrontMatterProcessor } from "./services/FrontMatterProcessorV2";

// Legacy compatibility
import { HexoIntegrationSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import HexoIntegrationSettingsTab from "./settings/hexoIntegrationSettingsTab";

// Git operations
import { SafeGitService } from './services/SafeGitService';
import { assertManagedPath, isMarkdown, isInside } from './services/ManagedPaths';
import { promises as fs } from 'fs';

/**
 * Unified Hexo Integration Plugin - V3
 * Coordinates filesystem and Git work through a serial operation queue
 */
export default class HexoIntegrationPluginV3 extends Plugin {
    // Settings
    settings: HexoIntegrationSettings;
    
    // Modern services
    private symlinkService: SymlinkServiceV2;
    private fileWatcher: FileWatcherV2;
    private fileScanner: FileScannerV2 | undefined;
    private frontMatterProcessor: FrontMatterProcessorV2;
    private git: SafeGitService | undefined;
    private activeSettings: HexoIntegrationSettings;
    private work: Promise<unknown> = Promise.resolve();
    private disposed = false;
    
    // State management
    private isInitialized = false;
    private isWatching = false;
    private unwatchFunctions: Array<() => Promise<void>> = [];
    private lastScanTime = new Date();
    
    // Statistics
    private stats = {
        filesProcessed: 0,
        lastSync: null as Date | null,
        errors: 0,
        warnings: 0
    };

    async onload() {
        console.log('Loading Hexo Integration Plugin V3...');
        
        try {
            // Step 1: Load settings
            await this.loadSettings();
            
            // Step 2: Initialize core services
            await this.initializeCoreServices();
            
            // Step 3: Setup UI
            this.setupUI();
            
            this.isInitialized = true;
            // Step 4: Initialize blog integration if configured
            if (this.settings.hexoSourcePath) {
                await this.enqueue(() => this.initializeBlogIntegration());
            } else {
                this.showConfigurationNotice();
            }
            
            this.isInitialized = true;
            console.log('✅ Hexo Integration Plugin V3 loaded successfully');
            
        } catch (error) {
            await this.stopWatching();
            console.error('❌ Failed to load Hexo Integration Plugin V3:', error);
            new Notice(
                `⚠️ Hexo Integration Plugin failed to load\n\n` +
                `Error: ${error.message}\n\n` +
                `Please check your settings and try again.`,
                10000
            );
        }
    }

    async onunload() {
        console.log('Unloading Hexo Integration Plugin V3...');
        
        try {
            await this.cleanup();
            console.log('✅ Plugin unloaded successfully');
        } catch (error) {
            console.error('Error during unload:', error);
        }
    }

    /**
     * Initialize core services that don't require blog path
     */
    private async initializeCoreServices(): Promise<void> {
        // Initialize symlink service
        this.symlinkService = new SymlinkServiceV2(this.app);
        
        // Initialize file watcher
        this.fileWatcher = new FileWatcherV2(300); // 300ms debounce
        this.fileWatcher.on('watcherError', error => {
            this.isWatching = false;
            this.stats.errors++;
            new Notice(`File watching failed: ${error.message}. Use Sync Now after correcting the problem.`);
        });
        
        // Initialize front-matter processor
        this.frontMatterProcessor = createHexoFrontMatterProcessor({
            autoAddDate: this.settings.autoAddDate,
            autoGenerateTitle: this.settings.autoGenerateTitle,
            requiredFields: ['title', 'date']
        });
        
        console.log('Core services initialized');
    }

    /**
     * Initialize blog-specific integration
     */
    private async initializeBlogIntegration(): Promise<void> {
        await this.stopWatching();
        this.git = undefined;
        this.fileScanner = undefined;
        this.activeSettings = { ...this.settings };
        this.validateSettings(this.activeSettings);
        if (!this.activeSettings.hexoSourcePath) return;
        const posts = path.join(this.activeSettings.hexoSourcePath, 'source', '_posts');
        if (!(await fs.stat(posts)).isDirectory()) throw new Error('Hexo source/_posts directory is missing');
        if (!isInside(await fs.realpath(this.activeSettings.hexoSourcePath), await fs.realpath(posts))) throw new Error('Posts directory must stay inside the repository');
        this.frontMatterProcessor = createHexoFrontMatterProcessor({
            autoAddDate: this.activeSettings.autoAddDate,
            autoGenerateTitle: this.activeSettings.autoGenerateTitle,
            requiredFields: []
        });
        await this.initializeGitOperations();
        await this.setupBlogLink();
        this.fileScanner = new FileScannerV2(this.activeSettings.hexoSourcePath);
        if (this.activeSettings.autoSync) await this.startWatching();
        // Register the watcher first; events are serialized behind this initial scan.
        await this.performInitialScan();
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const task = this.work.then(() => {
            if (this.disposed) throw new Error('Plugin is unloaded');
            return operation();
        });
        this.work = task.catch(() => undefined);
        return task;
    }

    /**
     * Setup an inert blog reference without exposing an external tree to the vault indexer
     */
    private async setupBlogLink(): Promise<void> {
        try {
            // Check if symlink is valid
            const validation = await this.symlinkService.validateSymlink(this.settings.hexoSourcePath);
            
            if (validation.needsRecreation) {
                console.log('Creating safe blog reference...');
                const result = await this.symlinkService.createSafeSymlink(this.settings.hexoSourcePath);
                
                if (!result.success) {
                    console.warn('Blog reference creation failed:', result.message);
                    throw new Error(`Failed to create blog reference: ${result.message}`);
                }
            } else {
                console.log(`Blog reference is valid (${validation.type})`);
            }
            
        } catch (error) {
            console.error('Blog reference setup failed:', error);
            // Don't throw - allow plugin to continue with reduced functionality
            new Notice(`⚠️ Blog reference setup failed: ${error.message}\nExternal posts are still synced directly; existing external links must be migrated manually.`);
        }
    }

    /**
     * Initialize git operations
     */
    private async initializeGitOperations(): Promise<void> {
        this.git = undefined;
        const root = this.activeSettings.hexoSourcePath;
        const git = new SafeGitService(root, path.join(root, 'source', '_posts'));
        await git.validate();
        this.git = git;
    }

    /**
     * Perform initial scan and process files
     */
    private async performInitialScan(): Promise<void> {
        if (!this.fileScanner) throw new Error('Configure a valid Hexo repository before syncing');
        const scanResult = await this.fileScanner.comprehensiveScan('source/_posts', { includePatterns: ['**/*'] });
        const files = [...new Set([...scanResult.newFiles, ...scanResult.modifiedFiles])];
        await this.processFrontMatterBatch(files.filter(isMarkdown));
        if (this.git && this.activeSettings.autoCommit) {
            await this.commitChanges([...files, ...scanResult.deletedFiles]);
        }
        this.lastScanTime = new Date();
    }

    /**
     * Start file watching
     */
    private async startWatching(): Promise<void> {
        if (!this.activeSettings.hexoSourcePath || this.isWatching) {
            return;
        }

        try {
            const postsPath = path.join(this.activeSettings.hexoSourcePath, 'source', '_posts');
            
            // Setup file watcher
            const unwatch = this.fileWatcher.watch(
                postsPath,
                this.handleFileChange.bind(this),
                {
                    ignore: [
                        '**/*.tmp',
                        '**/*.swp',
                        '**/.DS_Store'
                    ],
                    ignoreInitial: true
                }
            );
            
            this.unwatchFunctions.push(unwatch);
            await this.fileWatcher.ready(postsPath);
            this.isWatching = true;
            
            console.log('File watching started');
            new Notice('📁 Blog file watching started');
            
        } catch (error) {
            console.error('Failed to start file watching:', error);
            new Notice(`⚠️ Failed to start file watching: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle file change events
     */
    private async handleFileChange(event: FileChangeEvent): Promise<void> {
        if (event.type === 'addDir' || event.type === 'unlinkDir') return;
        const settingsAtEvent = this.activeSettings;
        await this.enqueue(async () => {
            if (settingsAtEvent !== this.activeSettings) return;
            const posts = path.join(this.activeSettings.hexoSourcePath, 'source', '_posts');
            await assertManagedPath(posts, event.path, event.type === 'unlink');
            if (event.type !== 'unlink' && isMarkdown(event.path)) {
                await this.processFrontMatterBatch([event.path]);
            }
            if (this.git && this.activeSettings.autoCommit) await this.commitChanges([event.path]);
        }).catch(error => {
            this.stats.errors++;
            new Notice(`Sync failed: ${error.message}`);
        });
    }

    /**
     * Process front-matter for multiple files
     */
    private async processFrontMatterBatch(filePaths: string[]): Promise<void> {
        if (filePaths.length === 0) return;
        
        try {
            console.log(`Processing front-matter for ${filePaths.length} files...`);
            
            const files = [...new Set(filePaths)].filter(isMarkdown);
            const posts = path.join(this.activeSettings.hexoSourcePath, 'source', '_posts');
            for (const file of files) await assertManagedPath(posts, file);
            const results = await this.frontMatterProcessor.processFiles(files);
            const summary = this.frontMatterProcessor.getSummary(results);
            const recoveryWarnings = results.flatMap(result => result.warnings).filter(warning => warning.startsWith('Original retained'));
            if (recoveryWarnings.length) {
                console.warn('Front-matter recovery locations:', recoveryWarnings);
                new Notice(`${recoveryWarnings.length} post backup(s). Close and reopen external editors before further editing. ${recoveryWarnings[0]}${recoveryWarnings.length > 1 ? ' More locations are listed in the developer console.' : ''}`, 20000);
            }
            
            this.stats.filesProcessed += summary.successful;
            this.stats.errors += summary.errors;
            this.stats.warnings += summary.warnings;
            
            if (summary.modified > 0) {
                new Notice(`✅ Updated ${summary.modified} files with proper front-matter`);
            }
            
            console.log('Front-matter processing summary:', summary);
            if (summary.errors > 0) throw new Error('Some posts could not be processed; no automatic commit was made');
            
        } catch (error) {
            console.error('Batch front-matter processing failed:', error);
            throw error;
        }
    }

    /**
     * Commit changes to git
     */
    private async commitChanges(filePaths: string[]): Promise<void> {
        if (!this.git) throw new Error('Git is not initialized');
        const message = `Update posts from Obsidian at ${new Date().toISOString()}`;
        const outcome = await this.git.commit(filePaths, message, this.activeSettings.autoPush);
        if (outcome.committed || outcome.pushed) this.stats.lastSync = new Date();
    }

    /**
     * Setup user interface
     */
    private setupUI(): void {
        // Add settings tab
        this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
        
        // Add commands
        this.addCommand({
            id: 'sync-now',
            name: 'Sync Now',
            callback: () => this.handleSyncNow()
        });
        
        this.addCommand({
            id: 'toggle-auto-sync',
            name: 'Toggle Auto-Sync',
            callback: () => this.handleToggleAutoSync()
        });
        
        this.addCommand({
            id: 'process-all-posts',
            name: 'Process All Posts Front-Matter',
            callback: () => this.handleProcessAllPosts()
        });
        
        this.addCommand({
            id: 'show-stats',
            name: 'Show Plugin Statistics',
            callback: () => this.handleShowStats()
        });
        
        this.addCommand({
            id: 'recreate-blog-link',
            name: 'Create Safe Blog Reference',
            callback: () => this.handleRecreateBlogLink()
        });
    }

    /**
     * Command handlers
     */
    private async handleSyncNow(): Promise<void> {
        if (!this.isInitialized) {
            new Notice('Plugin not fully initialized yet');
            return;
        }
        
        new Notice('🔄 Starting manual sync...');
        
        try {
            await this.enqueue(() => this.performInitialScan());
            new Notice('✅ Manual sync completed');
        } catch (error) {
            console.error('Manual sync failed:', error);
            new Notice(`❌ Manual sync failed: ${error.message}`);
        }
    }
    
    private async handleToggleAutoSync(): Promise<void> {
        this.settings.autoSync = !this.settings.autoSync;
        await this.saveSettings();
        
        new Notice(`Auto-sync ${this.settings.autoSync ? 'enabled' : 'disabled'}`);
    }
    
    private async handleProcessAllPosts(): Promise<void> {
        if (!this.fileScanner) {
            new Notice('File scanner not available');
            return;
        }
        
        try {
            await this.enqueue(async () => {
                const scanResult = await this.fileScanner!.comprehensiveScan();
                await this.processFrontMatterBatch(scanResult.allFiles);
            });
        } catch (error) {
            console.error('Process all posts failed:', error);
            new Notice(`❌ Failed to process posts: ${error.message}`);
        }
    }
    
    private handleShowStats(): void {
        const statsMessage = [
            `📊 Plugin Statistics:`,
            ``,
            `Files Processed: ${this.stats.filesProcessed}`,
            `Last Sync: ${this.stats.lastSync ? this.stats.lastSync.toLocaleString() : 'Never'}`,
            `Errors: ${this.stats.errors}`,
            `Warnings: ${this.stats.warnings}`,
            ``,
            `Status: ${this.isWatching ? '🟢 Watching' : '🔴 Not watching'}`,
            `Auto-Sync: ${this.settings.autoSync ? 'Enabled' : 'Disabled'}`,
            `Auto-Commit: ${this.settings.autoCommit ? 'Enabled' : 'Disabled'}`,
            `Auto-Push: ${this.settings.autoPush ? 'Enabled' : 'Disabled'}`
        ].join('\n');
        
        new Notice(statsMessage, 8000);
    }
    
    private async handleRecreateBlogLink(): Promise<void> {
        if (!this.settings.hexoSourcePath) {
            new Notice('Please configure Hexo source path first');
            return;
        }
        
        try {
            const result = await this.symlinkService.createSafeSymlink(this.settings.hexoSourcePath);
            if (result.success) {
                new Notice('✅ Safe blog reference ready (not a live external folder)');
            } else {
                new Notice(`❌ Blog reference not changed: ${result.message}`);
            }
        } catch (error) {
            console.error('Recreate blog link failed:', error);
            new Notice(`❌ Error: ${error.message}`);
        }
    }

    /**
     * Stop file watching
     */
    private async stopWatching(): Promise<void> {
        
        // Call all unwatch functions
        for (const unwatch of this.unwatchFunctions) {
            try {
                await unwatch();
            } catch (error) {
                console.error('Error calling unwatch function:', error);
            }
        }
        
        this.unwatchFunctions = [];
        this.isWatching = false;
        
        console.log('File watching stopped');
    }

    /**
     * Show configuration notice
     */
    private showConfigurationNotice(): void {
        new Notice(
            `🔧 Hexo Integration Setup Required\n\n` +
            `Please configure your Hexo blog path in the settings to enable full functionality.\n\n` +
            `Go to Settings → Hexo Integration to get started.`,
            8000
        );
    }

    /**
     * Cleanup resources
     */
    private async cleanup(): Promise<void> {
        this.disposed = true;
        // Stop file watching
        await this.stopWatching();
        await this.work;
        
        // Dispose services
        if (this.fileWatcher) {
            await this.fileWatcher.dispose();
        }
        
        console.log('Cleanup completed');
    }

    /**
     * Legacy compatibility methods
     */
    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.enqueue(async () => {
            await this.stopWatching();
            this.git = undefined;
            this.fileScanner = undefined;
            this.validateSettings(this.settings);
            await this.saveData(this.settings);
            if (this.isInitialized) await this.initializeBlogIntegration();
        });
    }

    /**
     * Validate plugin settings
     * @param settings Settings to validate
     */
    private validateSettings(settings: HexoIntegrationSettings): void {
        if (settings.hexoSourcePath && settings.hexoSourcePath.trim() === '') {
            throw new Error('Hexo source path cannot be empty');
        }
        
        if (settings.hexoSourcePath && !path.isAbsolute(settings.hexoSourcePath)) {
            throw new Error('Hexo source path must be an absolute path');
        }
        
        // Validate boolean settings are proper booleans
        if (typeof settings.autoSync !== 'boolean') {
            throw new Error('autoSync must be a boolean value');
        }
        if (typeof settings.autoCommit !== 'boolean') {
            throw new Error('autoCommit must be a boolean value');
        }
        if (typeof settings.autoPush !== 'boolean') {
            throw new Error('autoPush must be a boolean value');
        }
        if (typeof settings.autoAddDate !== 'boolean') {
            throw new Error('autoAddDate must be a boolean value');
        }
        if (typeof settings.autoGenerateTitle !== 'boolean') {
            throw new Error('autoGenerateTitle must be a boolean value');
        }
    }

    async createSymlink(hexoSourcePath: string): Promise<string> {
        try {
            const result = await this.symlinkService.createSafeSymlink(hexoSourcePath);
            return result.message;
        } catch (error) {
            console.error('Blog reference creation failed:', error);
            return 'failure';
        }
    }
}