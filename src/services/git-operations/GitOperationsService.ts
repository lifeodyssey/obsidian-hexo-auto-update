// Git Operations Service with Batch Functionality

import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import { 
  GitStatus, 
  Disposable,
  Event
} from '../../core/types';
import { IGitOperations, IEventBus, ILogger, ICircuitBreaker, IRetryHandler } from '../../core/tokens';
import { globalLogger } from '../../core/logging';
import { createCircuitBreaker } from '../../core/resilience/CircuitBreaker';
import { createRetryHandler, RetryConditions } from '../../core/resilience/RetryHandler';

export interface GitOperationsConfig {
  repoPath: string;
  defaultBranch: string;
  batchSize: number;
  commitMessageTemplate: string;
  autoStage: boolean;
  autoPush: boolean;
}

export interface BatchCommitOptions {
  message?: string;
  files?: string[];
  author?: {
    name: string;
    email: string;
  };
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  files?: string[];
  error?: Error;
  timestamp: Date;
}

export class GitOperationsService implements IGitOperations, Disposable {
  private git: SimpleGit;
  private config: GitOperationsConfig;
  private eventBus?: IEventBus;
  private logger: ILogger;
  private circuitBreaker: ICircuitBreaker;
  private retryHandler: IRetryHandler;
  private isDisposed = false;

  constructor(
    config: GitOperationsConfig,
    eventBus?: IEventBus,
    logger?: ILogger
  ) {
    this.config = config;
    this.eventBus = eventBus;
    this.logger = logger || globalLogger;
    
    // Initialize resilience patterns
    this.circuitBreaker = createCircuitBreaker();
    this.retryHandler = createRetryHandler();

    try {
      this.git = simpleGit(config.repoPath);
    } catch (error) {
      this.logger.error('Failed to initialize Git repository', error, { repoPath: config.repoPath });
      throw error;
    }
  }

  /**
   * Get repository status
   * @returns Promise resolving to git status
   */
  async status(): Promise<GitStatus> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    return await this.retryHandler.executeWithRetry(
      () => this.circuitBreaker.execute(async () => {
        const result = await this.git.status();
        return this.mapStatusResult(result);
      }),
      'Git status check'
    );
  }

  /**
   * Add files to staging area
   * @param files Files to add (empty array = add all)
   */
  async add(files: string[] = []): Promise<void> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    await this.retryHandler.executeWithRetry(
      () => this.circuitBreaker.execute(async () => {
        if (files.length === 0) {
          await this.git.add('.');
        } else {
          // Process files in batches to avoid command line length limits
          const batches = this.chunkArray(files, this.config.batchSize);
          
          for (const batch of batches) {
            await this.git.add(batch);
          }
        }

        await this.publishEvent('git.add', {
          files: files.length === 0 ? ['all'] : files,
          batchSize: this.config.batchSize
        });

        this.logger.info('Files added to staging area', { 
          files: files.length === 0 ? 'all' : files,
          count: files.length 
        });
      }),
      'Git add operation'
    );
  }

  /**
   * Commit staged changes
   * @param message Commit message
   */
  async commit(message: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    await this.retryHandler.executeWithRetry(
      () => this.circuitBreaker.execute(async () => {
        const formattedMessage = this.formatCommitMessage(message);
        const result = await this.git.commit(formattedMessage);

        await this.publishEvent('git.commit', {
          message: formattedMessage,
          hash: result.commit,
          summary: result.summary
        });

        this.logger.info('Changes committed', { 
          message: formattedMessage,
          hash: result.commit,
          filesChanged: result.summary.changes
        });
      }),
      'Git commit operation'
    );
  }

  /**
   * Push changes to remote repository
   * @param remote Remote name (default: origin)
   * @param branch Branch name (default: configured branch)
   */
  async push(remote: string = 'origin', branch?: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    const targetBranch = branch || this.config.defaultBranch;

    await this.retryHandler.executeWithRetry(
      () => this.circuitBreaker.execute(async () => {
        const result = await this.git.push(remote, targetBranch);

        await this.publishEvent('git.push', {
          remote,
          branch: targetBranch,
          result
        });

        this.logger.info('Changes pushed to remote', { 
          remote,
          branch: targetBranch
        });
      }),
      'Git push operation'
    );
  }

  /**
   * Pull changes from remote repository
   * @param remote Remote name (default: origin)
   * @param branch Branch name (default: configured branch)
   */
  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    const targetBranch = branch || this.config.defaultBranch;

    await this.retryHandler.executeWithRetry(
      () => this.circuitBreaker.execute(async () => {
        const result = await this.git.pull(remote, targetBranch);

        await this.publishEvent('git.pull', {
          remote,
          branch: targetBranch,
          result
        });

        this.logger.info('Changes pulled from remote', { 
          remote,
          branch: targetBranch,
          summary: result.summary
        });
      }),
      'Git pull operation'
    );
  }

  /**
   * Check if directory is a git repository
   * @returns True if is repository
   */
  async isRepository(): Promise<boolean> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    try {
      const result = await this.retryHandler.executeWithRetry(
        () => this.git.checkIsRepo(),
        'Git repository check'
      );
      
      return result;
    } catch (error: any) {
      this.logger.debug('Repository check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Batch commit multiple files with individual messages
   * @param operations Array of commit operations
   * @returns Array of operation results
   */
  async batchCommit(operations: Array<{
    files: string[];
    message: string;
    options?: BatchCommitOptions;
  }>): Promise<GitOperationResult[]> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    const results: GitOperationResult[] = [];

    for (const operation of operations) {
      try {
        // Add files
        await this.add(operation.files);
        
        // Check if there are changes to commit
        const status = await this.status();
        if (status.staged.length === 0) {
          results.push({
            success: false,
            message: 'No changes to commit',
            files: operation.files,
            timestamp: new Date()
          });
          continue;
        }

        // Commit changes
        await this.commit(operation.message);

        results.push({
          success: true,
          message: 'Successfully committed',
          files: operation.files,
          timestamp: new Date()
        });

        this.logger.info('Batch commit operation completed', {
          files: operation.files,
          message: operation.message
        });

      } catch (error) {
        const errorResult: GitOperationResult = {
          success: false,
          message: error.message,
          files: operation.files,
          error: error as Error,
          timestamp: new Date()
        };

        results.push(errorResult);

        this.logger.error('Batch commit operation failed', error as Error, {
          files: operation.files,
          message: operation.message
        });

        await this.publishEvent('git.error', {
          operation: 'batchCommit',
          error: error.message,
          files: operation.files
        });
      }
    }

    return results;
  }

  /**
   * Smart commit that handles file processing and front-matter updates
   * @param files Files to process and commit
   * @param baseMessage Base commit message
   * @returns Operation result
   */
  async smartCommit(files: string[], baseMessage: string): Promise<GitOperationResult> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    try {
      // Filter files to only markdown files in posts directory
      const postFiles = files.filter(file => 
        file.includes('_posts') && file.endsWith('.md')
      );

      if (postFiles.length === 0) {
        return {
          success: false,
          message: 'No post files to commit',
          files: [],
          timestamp: new Date()
        };
      }

      // Add files
      await this.add(postFiles);

      // Generate smart commit message
      const message = this.generateSmartMessage(baseMessage, postFiles);

      // Commit
      await this.commit(message);

      // Auto-push if configured
      if (this.config.autoPush) {
        await this.push();
      }

      const result: GitOperationResult = {
        success: true,
        message: 'Smart commit completed successfully',
        files: postFiles,
        timestamp: new Date()
      };

      await this.publishEvent('git.smartCommit', {
        files: postFiles,
        message,
        autoPush: this.config.autoPush
      });

      return result;

    } catch (error) {
      const errorResult: GitOperationResult = {
        success: false,
        message: error.message,
        files,
        error: error as Error,
        timestamp: new Date()
      };

      this.logger.error('Smart commit failed', error as Error, { files });
      
      await this.publishEvent('git.error', {
        operation: 'smartCommit',
        error: error.message,
        files
      });

      return errorResult;
    }
  }

  /**
   * Get commit history
   * @param limit Number of commits to retrieve
   * @returns Array of commit information
   */
  async getCommitHistory(limit: number = 10): Promise<Array<{
    hash: string;
    message: string;
    author: string;
    date: Date;
  }>> {
    if (this.isDisposed) {
      throw new Error('GitOperationsService is disposed');
    }

    return await this.retryHandler.executeWithRetry(
      () => this.circuitBreaker.execute(async () => {
        const log = await this.git.log({ maxCount: limit });
        
        return log.all.map(commit => ({
          hash: commit.hash,
          message: commit.message,
          author: `${commit.author_name} <${commit.author_email}>`,
          date: new Date(commit.date)
        }));
      }),
      'Git log operation'
    );
  }

  /**
   * Dispose the service and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    
    await this.circuitBreaker.dispose();
    await this.retryHandler.dispose();
  }

  /**
   * Map simple-git StatusResult to our GitStatus interface
   * @param result Simple-git status result
   * @returns Mapped git status
   */
  private mapStatusResult(result: StatusResult): GitStatus {
    return {
      current: result.current || '',
      tracking: result.tracking || '',
      ahead: result.ahead,
      behind: result.behind,
      staged: result.staged,
      modified: result.modified,
      deleted: result.deleted,
      untracked: result.not_added,
      conflicted: result.conflicted
    };
  }

  /**
   * Format commit message using template
   * @param message Base message
   * @returns Formatted message
   */
  private formatCommitMessage(message: string): string {
    const timestamp = new Date().toISOString();
    
    return this.config.commitMessageTemplate
      .replace('{{message}}', message)
      .replace('{{timestamp}}', timestamp)
      .replace('{{count}}', '1'); // Default count for single commits
  }

  /**
   * Generate smart commit message based on files
   * @param baseMessage Base message
   * @param files Modified files
   * @returns Generated message
   */
  private generateSmartMessage(baseMessage: string, files: string[]): string {
    const count = files.length;
    const fileList = files.map(file => file.split('/').pop()).join(', ');
    
    return this.config.commitMessageTemplate
      .replace('{{message}}', baseMessage)
      .replace('{{count}}', count.toString())
      .replace('{{files}}', fileList)
      .replace('{{timestamp}}', new Date().toISOString());
  }

  /**
   * Split array into chunks
   * @param array Array to chunk
   * @param size Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Publish event if event bus is available
   * @param type Event type
   * @param payload Event payload
   */
  private async publishEvent(type: string, payload: any): Promise<void> {
    if (this.eventBus) {
      const event: Event = {
        type,
        timestamp: new Date(),
        payload
      };
      
      await this.eventBus.publish(event);
    }
  }
}

/**
 * Git operations service builder
 */
export class GitOperationsServiceBuilder {
  private config: Partial<GitOperationsConfig> = {};
  private eventBus?: IEventBus;
  private logger?: ILogger;

  /**
   * Set repository path
   * @param path Repository path
   * @returns Builder instance
   */
  withRepoPath(path: string): GitOperationsServiceBuilder {
    this.config.repoPath = path;
    return this;
  }

  /**
   * Set default branch
   * @param branch Branch name
   * @returns Builder instance
   */
  withDefaultBranch(branch: string): GitOperationsServiceBuilder {
    this.config.defaultBranch = branch;
    return this;
  }

  /**
   * Set batch size for operations
   * @param size Batch size
   * @returns Builder instance
   */
  withBatchSize(size: number): GitOperationsServiceBuilder {
    this.config.batchSize = size;
    return this;
  }

  /**
   * Set commit message template
   * @param template Message template
   * @returns Builder instance
   */
  withCommitTemplate(template: string): GitOperationsServiceBuilder {
    this.config.commitMessageTemplate = template;
    return this;
  }

  /**
   * Enable auto-staging
   * @param auto Whether to auto-stage
   * @returns Builder instance
   */
  withAutoStage(auto: boolean): GitOperationsServiceBuilder {
    this.config.autoStage = auto;
    return this;
  }

  /**
   * Enable auto-push
   * @param auto Whether to auto-push
   * @returns Builder instance
   */
  withAutoPush(auto: boolean): GitOperationsServiceBuilder {
    this.config.autoPush = auto;
    return this;
  }

  /**
   * Set event bus
   * @param eventBus Event bus instance
   * @returns Builder instance
   */
  withEventBus(eventBus: IEventBus): GitOperationsServiceBuilder {
    this.eventBus = eventBus;
    return this;
  }

  /**
   * Set logger
   * @param logger Logger instance
   * @returns Builder instance
   */
  withLogger(logger: ILogger): GitOperationsServiceBuilder {
    this.logger = logger;
    return this;
  }

  /**
   * Build git operations service
   * @returns Git operations service instance
   */
  build(): GitOperationsService {
    const fullConfig: GitOperationsConfig = {
      repoPath: this.config.repoPath || '',
      defaultBranch: this.config.defaultBranch || 'main',
      batchSize: this.config.batchSize || 10,
      commitMessageTemplate: this.config.commitMessageTemplate || 'Update: {{message}}',
      autoStage: this.config.autoStage || true,
      autoPush: this.config.autoPush || false
    };

    if (!fullConfig.repoPath) {
      throw new Error('Repository path is required');
    }

    return new GitOperationsService(fullConfig, this.eventBus, this.logger);
  }
}

/**
 * Create git operations service builder
 * @returns Git operations service builder
 */
export function gitOperationsServiceBuilder(): GitOperationsServiceBuilder {
  return new GitOperationsServiceBuilder();
}