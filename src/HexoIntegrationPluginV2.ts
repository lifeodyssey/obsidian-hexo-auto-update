// New Architecture Main Plugin Class

import { Notice, Plugin } from "obsidian";
import { join } from "path";

// Core architecture
import { DIContainer, globalContainer } from "./core/container";
import { ConfigurationManager, PathValidator, SyncValidator, GitValidator, FrontMatterValidator } from "./core/config";
import { EventBus, EventTypes } from "./core/events";
import { Logger, ConsoleTransport, LogLevel } from "./core/logging";
import { TOKENS } from "./core/tokens";
import { HexoConfig, Disposable } from "./core/types";

// Services
import { FileWatcherService } from "./services/file-watcher";
import { ContentProcessingService } from "./services/content-processing";
import { GitOperationsService, gitOperationsServiceBuilder } from "./services/git-operations";
import { SynchronizationService, synchronizationServiceBuilder } from "./services/synchronization";

// Legacy compatibility
import { HexoIntegrationSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import HexoIntegrationSettingsTab from "./settings/hexoIntegrationSettingsTab";

export default class HexoIntegrationPluginV2 extends Plugin {
  // Core infrastructure
  private container: DIContainer;
  private eventBus: EventBus;
  private logger: Logger;
  private configManager: ConfigurationManager;

  // Core services
  private fileWatcher: FileWatcherService;
  private contentProcessor: ContentProcessingService;
  private gitOperations: GitOperationsService;
  private synchronization: SynchronizationService;

  // Plugin settings (legacy compatibility)
  settings: HexoIntegrationSettings;

  async onload() {
    try {
      await this.initializeInfrastructure();
      await this.loadSettings();
      await this.initializeServices();
      await this.setupUI();
      
      this.logger.info('Hexo Integration Plugin V2 loaded successfully');
      
    } catch (error) {
      this.logger.critical('Failed to initialize plugin', error);
      new Notice('Failed to initialize Hexo Integration plugin. Check console for details.');
      throw error;
    }
  }

  async onunload() {
    try {
      await this.disposeServices();
      await this.disposeInfrastructure();
      
      this.logger.info('Hexo Integration Plugin V2 unloaded successfully');
      
    } catch (error) {
      console.error('Error during plugin unload:', error);
    }
  }

  /**
   * Initialize core infrastructure
   */
  private async initializeInfrastructure(): Promise<void> {
    // Create new container for this plugin instance
    this.container = new DIContainer();

    // Initialize event bus
    this.eventBus = new EventBus();
    this.container.registerSingleton(TOKENS.EventBus, () => this.eventBus);

    // Initialize logger
    this.logger = new Logger(LogLevel.INFO);
    this.logger.addTransport(new ConsoleTransport());
    this.logger.setContext({ plugin: 'HexoIntegrationV2' });
    this.container.registerSingleton(TOKENS.Logger, () => this.logger);

    // Initialize configuration manager
    const configPath = join(this.app.vault.configDir, 'hexo-integration.json');
    this.configManager = new ConfigurationManager(configPath, {
      paths: {
        vault: this.app.vault.adapter.basePath || ''
      }
    });

    // Add validators
    this.configManager.addValidator(new PathValidator());
    this.configManager.addValidator(new SyncValidator());
    this.configManager.addValidator(new GitValidator());
    this.configManager.addValidator(new FrontMatterValidator());

    this.container.registerSingleton(TOKENS.ConfigurationManager, () => this.configManager);

    // Set up event handlers
    await this.setupEventHandlers();
  }

  /**
   * Load and migrate settings
   */
  private async loadSettings(): Promise<void> {
    try {
      // Load legacy settings first
      this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

      // Load new configuration
      let hexoConfig: HexoConfig;
      try {
        hexoConfig = await this.configManager.load();
      } catch (error) {
        // Migrate from legacy settings
        hexoConfig = this.migrateLegacySettings(this.settings);
        await this.configManager.save(hexoConfig);
        this.logger.info('Settings migrated to new configuration format');
      }

      // Validate configuration
      await this.configManager.validate(hexoConfig);

    } catch (error) {
      this.logger.error('Error loading settings', error);
      throw error;
    }
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    const hexoConfig = this.configManager.get();

    if (!hexoConfig.paths.source) {
      this.logger.warning('Hexo source path not configured');
      new Notice('Please configure the path to your Hexo blog in the settings.');
      return;
    }

    try {
      // Initialize file watcher
      this.fileWatcher = new FileWatcherService();
      this.container.registerSingleton(TOKENS.FileWatcherService, () => this.fileWatcher);

      // Initialize content processor
      this.contentProcessor = new ContentProcessingService();
      this.container.registerSingleton(TOKENS.ContentProcessor, () => this.contentProcessor);

      // Initialize git operations
      this.gitOperations = gitOperationsServiceBuilder()
        .withRepoPath(hexoConfig.paths.source)
        .withDefaultBranch(hexoConfig.git.branchName)
        .withBatchSize(hexoConfig.sync.batchSize)
        .withCommitTemplate(hexoConfig.git.commitMessageTemplate)
        .withAutoStage(true)
        .withAutoPush(hexoConfig.git.autoPush)
        .withEventBus(this.eventBus)
        .withLogger(this.logger)
        .build();
      
      this.container.registerSingleton(TOKENS.GitOperations, () => this.gitOperations);

      // Validate git repository
      const isRepo = await this.gitOperations.isRepository();
      if (!isRepo) {
        throw new Error(`Directory ${hexoConfig.paths.source} is not a git repository`);
      }

      // Initialize synchronization service
      this.synchronization = synchronizationServiceBuilder()
        .withFileWatcher(this.fileWatcher)
        .withContentProcessor(this.contentProcessor)
        .withGitOperations(this.gitOperations)
        .withEventBus(this.eventBus)
        .withConfigManager(this.configManager)
        .withLogger(this.logger)
        .withConfig({
          watchPaths: [join(hexoConfig.paths.source, hexoConfig.paths.posts)],
          batchTimeMs: hexoConfig.sync.debounceMs,
          debounceMs: 500,
          maxBatchSize: hexoConfig.sync.batchSize,
          autoCommit: hexoConfig.git.autoCommit,
          autoPush: hexoConfig.git.autoPush,
          commitTemplate: hexoConfig.git.commitMessageTemplate,
          retryAttempts: hexoConfig.sync.retryAttempts,
          retryDelayMs: hexoConfig.sync.retryDelayMs
        })
        .build();

      this.container.registerSingleton(TOKENS.SynchronizationService, () => this.synchronization);

      // Start synchronization if watch mode is enabled
      if (hexoConfig.sync.watchMode) {
        await this.synchronization.start();
      }

      this.logger.info('All services initialized successfully', {
        watchMode: hexoConfig.sync.watchMode,
        sourcePath: hexoConfig.paths.source
      });

    } catch (error) {
      this.logger.error('Error initializing services', error);
      throw error;
    }
  }

  /**
   * Set up user interface
   */
  private async setupUI(): Promise<void> {
    // Add settings tab (reuse existing for compatibility)
    this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));

    // Add commands
    this.addCommand({
      id: 'sync-now',
      name: 'Sync Now',
      callback: () => this.handleSyncNow()
    });

    this.addCommand({
      id: 'toggle-watch-mode',
      name: 'Toggle Watch Mode',
      callback: () => this.handleToggleWatchMode()
    });

    this.addCommand({
      id: 'show-sync-status',
      name: 'Show Sync Status',
      callback: () => this.handleShowStatus()
    });
  }

  /**
   * Set up event handlers
   */
  private async setupEventHandlers(): Promise<void> {
    // Handle sync events
    this.eventBus.subscribe(EventTypes.SYNC_COMPLETED, {
      handle: async (event) => {
        new Notice(`Sync completed: ${event.payload.processedFiles} files processed`);
      }
    });

    this.eventBus.subscribe(EventTypes.SYNC_FAILED, {
      handle: async (event) => {
        new Notice(`Sync failed: ${event.payload.error}`);
        this.logger.error('Sync operation failed', undefined, { error: event.payload.error });
      }
    });

    // Handle git events
    this.eventBus.subscribe(EventTypes.GIT_COMMIT, {
      handle: async (event) => {
        this.logger.info('Git commit completed', { 
          message: event.payload.message,
          hash: event.payload.hash 
        });
      }
    });

    this.eventBus.subscribe(EventTypes.GIT_PUSH, {
      handle: async (event) => {
        new Notice('Changes pushed to remote repository');
        this.logger.info('Git push completed', { 
          remote: event.payload.remote,
          branch: event.payload.branch 
        });
      }
    });

    // Handle configuration changes
    this.eventBus.subscribe(EventTypes.CONFIG_CHANGED, {
      handle: async (event) => {
        this.logger.info('Configuration changed, reinitializing services');
        await this.reinitializeServices();
      }
    });
  }

  /**
   * Command handlers
   */
  private async handleSyncNow(): Promise<void> {
    if (!this.synchronization) {
      new Notice('Synchronization service not initialized');
      return;
    }

    try {
      const result = await this.synchronization.syncNow();
      
      if (result.success) {
        new Notice(`Sync completed: ${result.processedFiles.length} files processed`);
      } else {
        new Notice(`Sync failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      this.logger.error('Manual sync failed', error);
      new Notice('Sync failed. Check console for details.');
    }
  }

  private async handleToggleWatchMode(): Promise<void> {
    if (!this.synchronization) {
      new Notice('Synchronization service not initialized');
      return;
    }

    const config = this.configManager.get();
    const newWatchMode = !config.sync.watchMode;

    try {
      // Update configuration
      await this.configManager.save({
        sync: { ...config.sync, watchMode: newWatchMode }
      });

      // Start or stop synchronization
      if (newWatchMode) {
        await this.synchronization.start();
        new Notice('Watch mode enabled');
      } else {
        await this.synchronization.stop();
        new Notice('Watch mode disabled');
      }

      // Update legacy settings for compatibility
      this.settings.autoSync = newWatchMode;
      await this.saveData(this.settings);

    } catch (error) {
      this.logger.error('Error toggling watch mode', error);
      new Notice('Failed to toggle watch mode');
    }
  }

  private async handleShowStatus(): Promise<void> {
    if (!this.synchronization) {
      new Notice('Synchronization service not initialized');
      return;
    }

    const status = this.synchronization.getStatus();
    const config = this.configManager.get();

    const statusMessage = [
      `Watch Mode: ${config.sync.watchMode ? 'Enabled' : 'Disabled'}`,
      `Status: ${status.isRunning ? 'Running' : 'Stopped'}`,
      `Last Sync: ${status.lastSync ? status.lastSync.toLocaleString() : 'Never'}`,
      `Total Processed: ${status.totalProcessed}`,
      `Errors: ${status.errors}`
    ].join('\n');

    new Notice(statusMessage, 5000);
  }

  /**
   * Legacy compatibility methods
   */
  async saveSettings(): Promise<void> {
    try {
      // Save legacy settings
      await this.saveData(this.settings);

      // Migrate to new configuration
      const hexoConfig = this.migrateLegacySettings(this.settings);
      await this.configManager.save(hexoConfig);

      // Publish configuration change event
      await this.eventBus.publish({
        type: EventTypes.CONFIG_CHANGED,
        timestamp: new Date(),
        payload: { source: 'legacy_settings' }
      });

      this.logger.info('Settings saved and migrated');

    } catch (error) {
      this.logger.error('Error saving settings', error);
      throw error;
    }
  }

  /**
   * Create symlink (legacy compatibility)
   */
  async createSymlink(hexoSourcePath: string): Promise<string> {
    try {
      // This would integrate with the symlink service
      // For now, return success to maintain compatibility
      this.logger.info('Symlink creation requested', { hexoSourcePath });
      return 'success';
    } catch (error) {
      this.logger.error('Error creating symlink', error);
      return 'failure';
    }
  }

  /**
   * Migrate legacy settings to new configuration format
   */
  private migrateLegacySettings(settings: HexoIntegrationSettings): HexoConfig {
    return {
      paths: {
        source: settings.hexoSourcePath || '',
        posts: 'source/_posts',
        output: 'public',
        vault: this.app.vault.adapter.basePath || ''
      },
      sync: {
        watchMode: settings.autoSync ?? true,
        batchSize: 10,
        debounceMs: 1000,
        retryAttempts: 3,
        retryDelayMs: 1000
      },
      git: {
        commitMessageTemplate: 'Update posts from Obsidian: {{count}} files changed',
        autoCommit: settings.autoCommit ?? true,
        autoPush: settings.autoPush ?? false,
        branchName: 'main'
      },
      frontMatter: {
        autoAddDate: true,
        dateFormat: 'YYYY-MM-DD HH:mm:ss',
        requiredFields: ['title']
      }
    };
  }

  /**
   * Reinitialize services after configuration change
   */
  private async reinitializeServices(): Promise<void> {
    try {
      // Stop existing services
      if (this.synchronization) {
        await this.synchronization.stop();
      }

      // Dispose and recreate services
      await this.disposeServices();
      await this.initializeServices();

      this.logger.info('Services reinitialized after configuration change');

    } catch (error) {
      this.logger.error('Error reinitializing services', error);
      throw error;
    }
  }

  /**
   * Dispose all services
   */
  private async disposeServices(): Promise<void> {
    const disposables: Disposable[] = [
      this.synchronization,
      this.gitOperations,
      this.contentProcessor,
      this.fileWatcher
    ].filter(Boolean);

    for (const disposable of disposables) {
      try {
        await disposable.dispose();
      } catch (error) {
        this.logger.error('Error disposing service', error);
      }
    }
  }

  /**
   * Dispose infrastructure
   */
  private async disposeInfrastructure(): Promise<void> {
    try {
      if (this.configManager) {
        await this.configManager.dispose();
      }

      if (this.eventBus) {
        await this.eventBus.dispose();
      }

      if (this.logger) {
        await this.logger.dispose();
      }

      if (this.container) {
        await this.container.dispose();
      }
    } catch (error) {
      console.error('Error disposing infrastructure:', error);
    }
  }
}