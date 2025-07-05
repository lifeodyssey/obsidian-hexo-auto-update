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
import { simpleGit, SimpleGit } from 'simple-git';

/**
 * Unified Hexo Integration Plugin - V3
 * Addresses all root cause issues with clean, modern architecture
 */
export default class HexoIntegrationPluginV3 extends Plugin {
    // Settings
    settings: HexoIntegrationSettings;
    
    // Modern services
    private symlinkService: SymlinkServiceV2;
    private fileWatcher: FileWatcherV2;
    private fileScanner: FileScannerV2;
    private frontMatterProcessor: FrontMatterProcessorV2;
    private git: SimpleGit;
    
    // State management
    private isInitialized = false;
    private isWatching = false;
    private unwatchFunctions: Array<() => void> = [];
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
            
            // Step 4: Initialize blog integration if configured
            if (this.settings.hexoSourcePath) {
                await this.initializeBlogIntegration();
            } else {
                this.showConfigurationNotice();
            }
            
            this.isInitialized = true;
            console.log('✅ Hexo Integration Plugin V3 loaded successfully');
            
        } catch (error) {
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
        if (!this.settings.hexoSourcePath) {
            throw new Error('Hexo source path not configured');
        }

        try {
            // Step 1: Validate and setup symlink
            await this.setupBlogLink();
            
            // Step 2: Initialize git operations
            await this.initializeGitOperations();
            
            // Step 3: Initialize file scanner
            this.fileScanner = new FileScannerV2(this.settings.hexoSourcePath);
            
            // Step 4: Perform initial scan and cleanup
            await this.performInitialScan();
            
            // Step 5: Start file watching if auto-sync is enabled
            if (this.settings.autoSync) {
                await this.startWatching();
            }
            
            console.log('Blog integration initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize blog integration:', error);
            throw error;
        }
    }

    /**
     * Setup blog symlink with safe permission handling
     */
    private async setupBlogLink(): Promise<void> {
        try {
            // Check if symlink is valid
            const validation = await this.symlinkService.validateSymlink(this.settings.hexoSourcePath);
            
            if (validation.needsRecreation) {
                console.log('Creating/updating blog link...');
                const result = await this.symlinkService.createSafeSymlink(this.settings.hexoSourcePath);
                
                if (!result.success) {
                    console.warn('Symlink creation failed:', result.message);
                    if (!result.fallback) {
                        throw new Error(`Failed to create blog link: ${result.message}`);
                    }
                }
            } else {
                console.log(`Blog link is valid (${validation.type})`);
            }
            
        } catch (error) {
            console.error('Blog link setup failed:', error);
            // Don't throw - allow plugin to continue with reduced functionality
            new Notice(`⚠️ Blog link setup failed: ${error.message}\nSome features may be limited.`);
        }
    }

    /**
     * Initialize git operations
     */
    private async initializeGitOperations(): Promise<void> {
        try {
            this.git = simpleGit(this.settings.hexoSourcePath);
            
            // Verify it's a git repository
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                throw new Error('Hexo source path is not a git repository');
            }
            
            console.log('Git operations initialized');
            
        } catch (error) {
            console.error('Git initialization failed:', error);
            // Don't throw - allow plugin to work without git
            new Notice(`⚠️ Git not available: ${error.message}\nCommit features will be disabled.`);
        }
    }

    /**
     * Perform initial scan and process files
     */
    private async performInitialScan(): Promise<void> {
        if (!this.fileScanner) return;
        
        try {
            console.log('Performing initial file scan...');
            
            const scanResult = await this.fileScanner.comprehensiveScan();
            const filesNeedingAttention = await this.fileScanner.findFilesNeedingAttention();
            
            console.log(`Found ${scanResult.allFiles.length} files`);
            console.log(`New files: ${scanResult.newFiles.length}`);
            console.log(`Modified files: ${scanResult.modifiedFiles.length}`);
            console.log(`Files needing attention: ${filesNeedingAttention.missingFrontMatter.length + filesNeedingAttention.recentlyCreated.length}`);
            
            // Process files that need front-matter attention
            const filesToProcess = [
                ...filesNeedingAttention.missingFrontMatter,
                ...filesNeedingAttention.recentlyCreated
            ];
            
            if (filesToProcess.length > 0) {
                await this.processFrontMatterBatch(filesToProcess);
            }
            
            // Commit new/modified files if git is available and auto-commit is enabled
            if (this.git && this.settings.autoCommit && (scanResult.newFiles.length > 0 || scanResult.modifiedFiles.length > 0)) {
                await this.commitChanges([...scanResult.newFiles, ...scanResult.modifiedFiles]);
            }
            
            this.lastScanTime = new Date();
            
        } catch (error) {
            console.error('Initial scan failed:', error);
            // Don't throw - allow plugin to continue
        }
    }

    /**
     * Start file watching
     */
    private async startWatching(): Promise<void> {
        if (!this.settings.hexoSourcePath || this.isWatching) {
            return;
        }

        try {
            const postsPath = path.join(this.settings.hexoSourcePath, 'source', '_posts');
            
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
            this.isWatching = true;
            
            console.log('File watching started');
            new Notice('📁 Blog file watching started');
            
        } catch (error) {
            console.error('Failed to start file watching:', error);
            new Notice(`⚠️ Failed to start file watching: ${error.message}`);
        }
    }

    /**
     * Handle file change events
     */
    private async handleFileChange(event: FileChangeEvent): Promise<void> {
        console.log(`File ${event.type}: ${path.basename(event.path)}`);
        
        try {
            if (event.type === 'add' || event.type === 'change') {
                // Process front-matter
                const result = await this.frontMatterProcessor.processFile(event.path);
                
                if (result.success) {
                    this.stats.filesProcessed++;
                    
                    if (result.modified) {
                        console.log(`Updated front-matter for ${path.basename(event.path)}`);
                    }
                    
                    // Auto-commit if enabled
                    if (this.git && this.settings.autoCommit) {
                        await this.commitChanges([event.path]);
                    }
                } else {
                    this.stats.errors++;
                    console.error(`Failed to process ${event.path}:`, result.errors);
                }
            }
            
        } catch (error) {
            this.stats.errors++;
            console.error('Error handling file change:', error);
        }
    }

    /**
     * Process front-matter for multiple files
     */
    private async processFrontMatterBatch(filePaths: string[]): Promise<void> {
        if (filePaths.length === 0) return;
        
        try {
            console.log(`Processing front-matter for ${filePaths.length} files...`);
            
            const results = await this.frontMatterProcessor.processFiles(filePaths);
            const summary = this.frontMatterProcessor.getSummary(results);
            
            this.stats.filesProcessed += summary.successful;
            this.stats.errors += summary.errors;
            this.stats.warnings += summary.warnings;
            
            if (summary.modified > 0) {
                new Notice(`✅ Updated ${summary.modified} files with proper front-matter`);
            }
            
            console.log('Front-matter processing summary:', summary);
            
        } catch (error) {
            console.error('Batch front-matter processing failed:', error);
        }
    }

    /**
     * Commit changes to git
     */
    private async commitChanges(filePaths: string[]): Promise<void> {
        if (!this.git || filePaths.length === 0) return;
        
        try {
            // Add files to git
            await this.git.add(filePaths);
            
            // Check if there are changes to commit
            const status = await this.git.status();
            if (status.staged.length === 0) {
                console.log('No changes to commit');
                return;
            }
            
            // Create commit message
            const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
            const fileNames = filePaths.map(p => path.basename(p)).join(', ');
            const message = `Update posts from Obsidian: ${fileNames} at ${timestamp}`;
            
            // Commit
            await this.git.commit(message);
            
            this.stats.lastSync = new Date();
            console.log('Changes committed successfully');
            
            // Auto-push if enabled
            if (this.settings.autoPush) {
                await this.git.push();
                console.log('Changes pushed to remote');
            }
            
        } catch (error) {
            console.error('Git commit failed:', error);
            this.stats.errors++;
        }
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
            name: 'Recreate Blog Link',
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
            await this.performInitialScan();
            new Notice('✅ Manual sync completed');
        } catch (error) {
            console.error('Manual sync failed:', error);
            new Notice(`❌ Manual sync failed: ${error.message}`);
        }
    }
    
    private async handleToggleAutoSync(): Promise<void> {
        this.settings.autoSync = !this.settings.autoSync;
        await this.saveSettings();
        
        if (this.settings.autoSync) {
            await this.startWatching();
        } else {
            await this.stopWatching();
        }
        
        new Notice(`Auto-sync ${this.settings.autoSync ? 'enabled' : 'disabled'}`);
    }
    
    private async handleProcessAllPosts(): Promise<void> {
        if (!this.fileScanner) {
            new Notice('File scanner not available');
            return;
        }
        
        try {
            const scanResult = await this.fileScanner.comprehensiveScan();
            await this.processFrontMatterBatch(scanResult.allFiles);
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
                new Notice('✅ Blog link recreated successfully');
            } else {
                new Notice(`❌ Failed to recreate blog link: ${result.message}`);
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
        if (!this.isWatching) return;
        
        // Call all unwatch functions
        for (const unwatch of this.unwatchFunctions) {
            try {
                unwatch();
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
        // Stop file watching
        await this.stopWatching();
        
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
        // Validate settings before saving
        this.validateSettings(this.settings);
        
        await this.saveData(this.settings);
        
        // Reinitialize if needed
        if (this.isInitialized && this.settings.hexoSourcePath) {
            try {
                await this.initializeBlogIntegration();
            } catch (error) {
                console.error('Failed to reinitialize after settings change:', error);
            }
        }
    }

    /**
     * Validate plugin settings
     * @param settings Settings to validate
     */
    private validateSettings(settings: HexoIntegrationSettings): void {
        if (settings.hexoSourcePath && settings.hexoSourcePath.trim() === '') {
            throw new Error('Hexo source path cannot be empty');
        }
        
        if (settings.hexoSourcePath && !settings.hexoSourcePath.startsWith('/')) {
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
            return result.success ? 'success' : 'failure';
        } catch (error) {
            console.error('Symlink creation failed:', error);
            return 'failure';
        }
    }
}