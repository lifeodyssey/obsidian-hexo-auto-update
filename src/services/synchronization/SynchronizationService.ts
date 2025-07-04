// Synchronization Service Orchestrator with Batch Processing

import { Subscription, merge } from 'rxjs';
import { 
  bufferTime, 
  filter, 
  mergeMap, 
  catchError, 
  retry,
  share,
  debounceTime,
  distinctUntilChanged
} from 'rxjs/operators';
import { 
  HexoConfig, 
  FileChangeEvent, 
  SyncResult, 
  SyncStatus, 
  Disposable,
  Event,
  ProcessingOptions
} from '../../core/types';
import { 
  ISynchronizationService, 
  IFileWatcherService, 
  IContentProcessor, 
  IGitOperations, 
  IEventBus, 
  ILogger,
  IConfigurationManager
} from '../../core/tokens';
import { globalLogger } from '../../core/logging';
import { EventTypes } from '../../core/events';
import crypto from 'crypto';

export interface SynchronizationConfig {
  watchPaths: string[];
  batchTimeMs: number;
  debounceMs: number;
  maxBatchSize: number;
  autoCommit: boolean;
  autoPush: boolean;
  commitTemplate: string;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface BatchProcessingResult {
  batchId: string;
  processedFiles: string[];
  skippedFiles: string[];
  errors: Array<{
    file: string;
    error: Error;
  }>;
  totalTime: number;
  timestamp: Date;
}

export class SynchronizationService implements ISynchronizationService, Disposable {
  private fileWatcher: IFileWatcherService;
  private contentProcessor: IContentProcessor;
  private gitOperations: IGitOperations;
  private eventBus: IEventBus;
  private logger: ILogger;
  private configManager: IConfigurationManager;
  
  private config: SynchronizationConfig;
  private isRunning = false;
  private subscription?: Subscription;
  private status: SyncStatus = {
    isRunning: false,
    lastSync: null,
    totalProcessed: 0,
    errors: 0
  };
  
  private processingQueue = new Set<string>();
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 5;
  private isDisposed = false;

  constructor(
    fileWatcher: IFileWatcherService,
    contentProcessor: IContentProcessor,
    gitOperations: IGitOperations,
    eventBus: IEventBus,
    configManager: IConfigurationManager,
    config: SynchronizationConfig,
    logger?: ILogger
  ) {
    this.fileWatcher = fileWatcher;
    this.contentProcessor = contentProcessor;
    this.gitOperations = gitOperations;
    this.eventBus = eventBus;
    this.configManager = configManager;
    this.config = config;
    this.logger = logger || globalLogger;

    this.setupEventHandlers();
  }

  /**
   * Start synchronization monitoring
   */
  async start(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('SynchronizationService is disposed');
    }

    if (this.isRunning) {
      this.logger.warning('Synchronization is already running');
      return;
    }

    try {
      // Validate git repository
      const isRepo = await this.gitOperations.isRepository();
      if (!isRepo) {
        throw new Error('Target directory is not a git repository');
      }

      // Create file watchers for all configured paths
      const watcherObservables = this.config.watchPaths.map(path => 
        this.fileWatcher.watch(path, {
          extensions: ['.md', '.markdown'],
          recursive: true,
          persistent: true,
          debounceMs: this.config.debounceMs,
          ignored: ['.git', 'node_modules', '.obsidian']
        })
      );

      // Merge all file watcher observables
      const fileChanges = merge(...watcherObservables).pipe(
        // Deduplicate similar events
        distinctUntilChanged((a, b) => 
          a.path === b.path && a.type === b.type && 
          Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) < 100
        ),
        // Additional debouncing for rapid changes
        debounceTime(this.config.debounceMs),
        // Filter out files currently being processed
        filter(event => !this.processingQueue.has(event.path)),
        // Share the observable
        share()
      );

      // Set up batch processing
      this.subscription = fileChanges.pipe(
        // Buffer events for batch processing
        bufferTime(this.config.batchTimeMs),
        // Filter out empty buffers
        filter(events => events.length > 0),
        // Process batches
        mergeMap(events => this.processBatch(events)),
        // Error handling with retry
        retry(this.config.retryAttempts),
        // Catch unrecoverable errors
        catchError(error => {
          this.logger.error('Unrecoverable synchronization error', error);
          this.handleCriticalError(error);
          return [];
        })
      ).subscribe();

      this.isRunning = true;
      this.status.isRunning = true;
      this.consecutiveFailures = 0;

      await this.eventBus.publish({
        type: EventTypes.SYNC_STARTED,
        timestamp: new Date(),
        payload: { 
          config: this.config,
          watchPaths: this.config.watchPaths
        }
      });

      this.logger.info('Synchronization service started', { 
        watchPaths: this.config.watchPaths,
        batchTimeMs: this.config.batchTimeMs
      });

    } catch (error) {
      this.logger.error('Failed to start synchronization service', error);
      await this.eventBus.publish({
        type: EventTypes.SYNC_FAILED,
        timestamp: new Date(),
        payload: { error: error.message }
      });
      throw error;
    }
  }

  /**
   * Stop synchronization monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Unsubscribe from file changes
      if (this.subscription) {
        this.subscription.unsubscribe();
        this.subscription = undefined;
      }

      // Wait for any ongoing processing to complete
      await this.waitForProcessingToComplete();

      this.isRunning = false;
      this.status.isRunning = false;

      await this.eventBus.publish({
        type: EventTypes.SYNC_STOPPED,
        timestamp: new Date(),
        payload: { 
          totalProcessed: this.status.totalProcessed,
          errors: this.status.errors
        }
      });

      this.logger.info('Synchronization service stopped', {
        totalProcessed: this.status.totalProcessed,
        errors: this.status.errors
      });

    } catch (error) {
      this.logger.error('Error stopping synchronization service', error);
      throw error;
    }
  }

  /**
   * Perform immediate synchronization
   */
  async syncNow(): Promise<SyncResult> {
    if (this.isDisposed) {
      throw new Error('SynchronizationService is disposed');
    }

    const startTime = Date.now();
    
    try {
      // Get current git status
      const gitStatus = await this.gitOperations.status();
      
      if (gitStatus.modified.length === 0 && gitStatus.untracked.length === 0) {
        return {
          success: true,
          processedFiles: [],
          errors: [],
          timestamp: new Date()
        };
      }

      // Process modified and untracked files
      const filesToProcess = [...gitStatus.modified, ...gitStatus.untracked]
        .filter(file => file.endsWith('.md') || file.endsWith('.markdown'));

      if (filesToProcess.length === 0) {
        return {
          success: true,
          processedFiles: [],
          errors: [],
          timestamp: new Date()
        };
      }

      // Process files
      const result = await this.processFiles(filesToProcess);
      
      // Commit changes if enabled and there are processed files
      if (this.config.autoCommit && result.processedFiles.length > 0) {
        const commitMessage = this.generateCommitMessage(result.processedFiles);
        await this.gitOperations.commit(commitMessage);
        
        // Push if enabled
        if (this.config.autoPush) {
          await this.gitOperations.push();
        }
      }

      const syncResult: SyncResult = {
        success: result.errors.length === 0,
        processedFiles: result.processedFiles,
        errors: result.errors.map(e => e.error.message),
        timestamp: new Date()
      };

      this.status.lastSync = new Date();
      this.status.totalProcessed += result.processedFiles.length;
      this.status.errors += result.errors.length;

      this.logger.info('Manual sync completed', {
        processedFiles: result.processedFiles.length,
        errors: result.errors.length,
        duration: Date.now() - startTime
      });

      return syncResult;

    } catch (error) {
      this.logger.error('Manual sync failed', error);
      
      return {
        success: false,
        processedFiles: [],
        errors: [error.message],
        timestamp: new Date()
      };
    }
  }

  /**
   * Get current synchronization status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<SynchronizationConfig>): Promise<void> {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      await this.stop();
    }
    
    this.config = { ...this.config, ...newConfig };
    
    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Dispose the service and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    
    await this.stop();
    this.processingQueue.clear();
  }

  /**
   * Process a batch of file change events
   */
  private async processBatch(events: FileChangeEvent[]): Promise<BatchProcessingResult[]> {
    const batchId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.debug('Processing file change batch', { 
      batchId, 
      eventCount: events.length 
    });

    await this.eventBus.publish({
      type: EventTypes.SYNC_BATCH_STARTED,
      timestamp: new Date(),
      payload: { batchId, events: events.length }
    });

    try {
      // Group events by file path to handle multiple changes to same file
      const fileMap = new Map<string, FileChangeEvent>();
      for (const event of events) {
        fileMap.set(event.path, event);
      }

      const uniqueFiles = Array.from(fileMap.values());
      
      // Limit batch size
      const filesToProcess = uniqueFiles.slice(0, this.config.maxBatchSize);

      // Process files
      const result = await this.processFiles(filesToProcess.map(e => e.path));

      // Commit changes if enabled and auto-commit is on
      if (this.config.autoCommit && result.processedFiles.length > 0) {
        const commitMessage = this.generateCommitMessage(result.processedFiles);
        await this.gitOperations.commit(commitMessage);
        
        // Push if enabled
        if (this.config.autoPush) {
          await this.gitOperations.push();
        }
      }

      const batchResult: BatchProcessingResult = {
        batchId,
        processedFiles: result.processedFiles,
        skippedFiles: result.skippedFiles,
        errors: result.errors,
        totalTime: Date.now() - startTime,
        timestamp: new Date()
      };

      // Update status
      this.status.lastSync = new Date();
      this.status.totalProcessed += result.processedFiles.length;
      this.status.errors += result.errors.length;
      this.consecutiveFailures = 0;

      await this.eventBus.publish({
        type: EventTypes.SYNC_BATCH_COMPLETED,
        timestamp: new Date(),
        payload: { 
          batchId, 
          processedFiles: result.processedFiles.length,
          errors: result.errors.length
        }
      });

      this.logger.info('Batch processing completed', {
        batchId,
        processedFiles: result.processedFiles.length,
        errors: result.errors.length,
        duration: batchResult.totalTime
      });

      return [batchResult];

    } catch (error) {
      this.consecutiveFailures++;
      
      await this.eventBus.publish({
        type: EventTypes.SYNC_BATCH_FAILED,
        timestamp: new Date(),
        payload: { batchId, error: error.message }
      });

      this.logger.error('Batch processing failed', error, { batchId });

      // Handle consecutive failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        await this.handleCriticalError(error);
      }

      throw error;
    }
  }

  /**
   * Process multiple files
   */
  private async processFiles(filePaths: string[]): Promise<{
    processedFiles: string[];
    skippedFiles: string[];
    errors: Array<{ file: string; error: Error }>;
  }> {
    const processedFiles: string[] = [];
    const skippedFiles: string[] = [];
    const errors: Array<{ file: string; error: Error }> = [];

    const hexoConfig = this.configManager.get();
    const processingOptions: ProcessingOptions = {
      validateFrontMatter: true,
      autoAddDate: hexoConfig.frontMatter.autoAddDate,
      dateFormat: hexoConfig.frontMatter.dateFormat,
      requiredFields: hexoConfig.frontMatter.requiredFields
    };

    for (const filePath of filePaths) {
      // Add to processing queue
      this.processingQueue.add(filePath);
      
      try {
        // Skip non-markdown files
        if (!filePath.endsWith('.md') && !filePath.endsWith('.markdown')) {
          skippedFiles.push(filePath);
          continue;
        }

        // Read file content
        const fs = await import('fs/promises');
        const content = await fs.readFile(filePath, 'utf-8');

        // Process content
        const processedContent = await this.contentProcessor.process(content, processingOptions);

        // Write back if content changed
        if (processedContent !== content) {
          await fs.writeFile(filePath, processedContent, 'utf-8');
        }

        // Add to git staging
        await this.gitOperations.add([filePath]);

        processedFiles.push(filePath);
        
        this.logger.debug('File processed successfully', { filePath });

      } catch (error) {
        errors.push({ file: filePath, error: error as Error });
        this.logger.error('Error processing file', error as Error, { filePath });
      } finally {
        // Remove from processing queue
        this.processingQueue.delete(filePath);
      }
    }

    return { processedFiles, skippedFiles, errors };
  }

  /**
   * Generate commit message for processed files
   */
  private generateCommitMessage(processedFiles: string[]): string {
    const count = processedFiles.length;
    const fileList = processedFiles
      .map(file => file.split('/').pop())
      .slice(0, 5) // Limit to first 5 files
      .join(', ');
    
    return this.config.commitTemplate
      .replace('{{count}}', count.toString())
      .replace('{{files}}', fileList + (count > 5 ? ` and ${count - 5} more` : ''))
      .replace('{{timestamp}}', new Date().toISOString());
  }

  /**
   * Wait for all ongoing processing to complete
   */
  private async waitForProcessingToComplete(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (this.processingQueue.size > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.processingQueue.size > 0) {
      this.logger.warning('Timeout waiting for processing to complete', {
        remainingFiles: Array.from(this.processingQueue)
      });
    }
  }

  /**
   * Handle critical errors that require stopping the service
   */
  private async handleCriticalError(error: Error): Promise<void> {
    this.logger.critical('Critical synchronization error, stopping service', error);
    
    await this.eventBus.publish({
      type: EventTypes.SYNC_FAILED,
      timestamp: new Date(),
      payload: { 
        error: error.message,
        consecutiveFailures: this.consecutiveFailures
      }
    });
    
    await this.stop();
  }

  /**
   * Set up event handlers for system events
   */
  private setupEventHandlers(): void {
    this.eventBus.subscribe('config.changed', {
      handle: async (event: Event) => {
        this.logger.info('Configuration changed, updating sync service');
        // Reload configuration and restart if needed
        const newConfig = this.configManager.get();
        // Update relevant sync config based on new hex config
        // This would need proper mapping logic
      }
    });

    this.eventBus.subscribe('git.error', {
      handle: async (event: Event) => {
        this.logger.warning('Git operation error detected', { payload: event.payload });
        this.consecutiveFailures++;
      }
    });
  }
}

/**
 * Synchronization service builder
 */
export class SynchronizationServiceBuilder {
  private fileWatcher?: IFileWatcherService;
  private contentProcessor?: IContentProcessor;
  private gitOperations?: IGitOperations;
  private eventBus?: IEventBus;
  private configManager?: IConfigurationManager;
  private logger?: ILogger;
  private config: Partial<SynchronizationConfig> = {};

  withFileWatcher(fileWatcher: IFileWatcherService): SynchronizationServiceBuilder {
    this.fileWatcher = fileWatcher;
    return this;
  }

  withContentProcessor(contentProcessor: IContentProcessor): SynchronizationServiceBuilder {
    this.contentProcessor = contentProcessor;
    return this;
  }

  withGitOperations(gitOperations: IGitOperations): SynchronizationServiceBuilder {
    this.gitOperations = gitOperations;
    return this;
  }

  withEventBus(eventBus: IEventBus): SynchronizationServiceBuilder {
    this.eventBus = eventBus;
    return this;
  }

  withConfigManager(configManager: IConfigurationManager): SynchronizationServiceBuilder {
    this.configManager = configManager;
    return this;
  }

  withLogger(logger: ILogger): SynchronizationServiceBuilder {
    this.logger = logger;
    return this;
  }

  withConfig(config: Partial<SynchronizationConfig>): SynchronizationServiceBuilder {
    this.config = { ...this.config, ...config };
    return this;
  }

  build(): SynchronizationService {
    if (!this.fileWatcher) throw new Error('FileWatcher is required');
    if (!this.contentProcessor) throw new Error('ContentProcessor is required');
    if (!this.gitOperations) throw new Error('GitOperations is required');
    if (!this.eventBus) throw new Error('EventBus is required');
    if (!this.configManager) throw new Error('ConfigManager is required');

    const fullConfig: SynchronizationConfig = {
      watchPaths: this.config.watchPaths || [],
      batchTimeMs: this.config.batchTimeMs || 2000,
      debounceMs: this.config.debounceMs || 500,
      maxBatchSize: this.config.maxBatchSize || 50,
      autoCommit: this.config.autoCommit ?? true,
      autoPush: this.config.autoPush ?? false,
      commitTemplate: this.config.commitTemplate || 'Update {{count}} posts: {{files}}',
      retryAttempts: this.config.retryAttempts || 3,
      retryDelayMs: this.config.retryDelayMs || 1000
    };

    return new SynchronizationService(
      this.fileWatcher,
      this.contentProcessor,
      this.gitOperations,
      this.eventBus,
      this.configManager,
      fullConfig,
      this.logger
    );
  }
}

/**
 * Create synchronization service builder
 */
export function synchronizationServiceBuilder(): SynchronizationServiceBuilder {
  return new SynchronizationServiceBuilder();
}