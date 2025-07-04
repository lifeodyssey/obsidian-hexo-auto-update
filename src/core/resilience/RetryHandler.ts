// Retry Handler with Exponential Backoff Implementation

import { RetryOptions, Disposable } from '../types';
import { IRetryHandler } from '../tokens';

export interface RetryAttempt {
  attempt: number;
  delay: number;
  error: Error;
  timestamp: Date;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: RetryAttempt[];
  totalTime: number;
}

export interface RetryStats {
  totalExecutions: number;
  totalRetries: number;
  totalFailures: number;
  totalSuccesses: number;
  averageAttempts: number;
  averageExecutionTime: number;
}

export class RetryHandler implements IRetryHandler, Disposable {
  private readonly options: RetryOptions;
  private stats: RetryStats = {
    totalExecutions: 0,
    totalRetries: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    averageAttempts: 0,
    averageExecutionTime: 0
  };
  private isDisposed = false;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = {
      maxAttempts: options.maxAttempts || 3,
      baseDelayMs: options.baseDelayMs || 1000,
      maxDelayMs: options.maxDelayMs || 30000,
      exponentialBase: options.exponentialBase || 2,
      jitter: options.jitter !== undefined ? options.jitter : true
    };
  }

  /**
   * Execute operation with retry logic
   * @param operation Operation to execute
   * @param context Context for logging and error handling
   * @returns Promise resolving to operation result
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'Unknown operation'
  ): Promise<T> {
    if (this.isDisposed) {
      throw new Error('RetryHandler is disposed');
    }

    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error;

    this.stats.totalExecutions++;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Success
        this.stats.totalSuccesses++;
        if (attempt > 1) {
          this.stats.totalRetries += (attempt - 1);
        }
        
        this.updateAverages(attempt, Date.now() - startTime);
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        const attemptInfo: RetryAttempt = {
          attempt,
          delay: 0,
          error: lastError,
          timestamp: new Date()
        };
        
        attempts.push(attemptInfo);

        if (attempt === this.options.maxAttempts) {
          // Final attempt failed
          this.stats.totalFailures++;
          this.stats.totalRetries += (attempt - 1);
          this.updateAverages(attempt, Date.now() - startTime);
          
          throw new Error(
            `Operation "${context}" failed after ${this.options.maxAttempts} attempts. ` +
            `Last error: ${lastError.message}`
          );
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        attemptInfo.delay = delay;
        
        // Wait before retry
        await this.delay(delay);
      }
    }

    // This should never be reached due to the logic above
    throw lastError!;
  }

  /**
   * Execute operation with retry and return detailed result
   * @param operation Operation to execute
   * @param context Context for logging and error handling
   * @returns Promise resolving to detailed retry result
   */
  async executeWithRetryResult<T>(
    operation: () => Promise<T>,
    context: string = 'Unknown operation'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error;

    this.stats.totalExecutions++;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Success
        this.stats.totalSuccesses++;
        if (attempt > 1) {
          this.stats.totalRetries += (attempt - 1);
        }
        
        this.updateAverages(attempt, Date.now() - startTime);
        
        return {
          success: true,
          result,
          attempts,
          totalTime: Date.now() - startTime
        };
        
      } catch (error) {
        lastError = error as Error;
        
        const attemptInfo: RetryAttempt = {
          attempt,
          delay: 0,
          error: lastError,
          timestamp: new Date()
        };
        
        attempts.push(attemptInfo);

        if (attempt < this.options.maxAttempts) {
          // Calculate delay for next attempt
          const delay = this.calculateDelay(attempt);
          attemptInfo.delay = delay;
          
          // Wait before retry
          await this.delay(delay);
        }
      }
    }

    // All attempts failed
    this.stats.totalFailures++;
    this.stats.totalRetries += (this.options.maxAttempts - 1);
    this.updateAverages(this.options.maxAttempts, Date.now() - startTime);
    
    return {
      success: false,
      error: lastError!,
      attempts,
      totalTime: Date.now() - startTime
    };
  }

  /**
   * Execute operation with custom retry conditions
   * @param operation Operation to execute
   * @param shouldRetry Function to determine if error should trigger retry
   * @param context Context for logging and error handling
   * @returns Promise resolving to operation result
   */
  async executeWithCustomRetry<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean,
    context: string = 'Unknown operation'
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error;

    this.stats.totalExecutions++;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        // Success
        this.stats.totalSuccesses++;
        if (attempt > 1) {
          this.stats.totalRetries += (attempt - 1);
        }
        
        this.updateAverages(attempt, Date.now() - startTime);
        return result;
        
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.options.maxAttempts || !shouldRetry(lastError, attempt)) {
          // Final attempt or should not retry
          this.stats.totalFailures++;
          this.stats.totalRetries += (attempt - 1);
          this.updateAverages(attempt, Date.now() - startTime);
          
          throw lastError;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        
        // Wait before retry
        await this.delay(delay);
      }
    }

    // This should never be reached
    throw lastError!;
  }

  /**
   * Get retry statistics
   * @returns Retry statistics
   */
  getStats(): RetryStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      totalRetries: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      averageAttempts: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * Create a pre-configured retry function
   * @param operation Operation to wrap
   * @param context Context for the operation
   * @returns Pre-configured retry function
   */
  wrap<T>(
    operation: () => Promise<T>,
    context: string = 'Wrapped operation'
  ): () => Promise<T> {
    return () => this.executeWithRetry(operation, context);
  }

  /**
   * Dispose retry handler
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
  }

  /**
   * Calculate delay for retry attempt
   * @param attempt Current attempt number
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.options.baseDelayMs * 
      Math.pow(this.options.exponentialBase, attempt - 1);
    
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelayMs);
    
    if (this.options.jitter) {
      // Add jitter to prevent thundering herd
      const jitterRange = cappedDelay * 0.1; // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Delay execution
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update average statistics
   * @param attempts Number of attempts
   * @param executionTime Execution time in milliseconds
   */
  private updateAverages(attempts: number, executionTime: number): void {
    const totalOps = this.stats.totalExecutions;
    
    // Update average attempts
    this.stats.averageAttempts = 
      (this.stats.averageAttempts * (totalOps - 1) + attempts) / totalOps;
    
    // Update average execution time
    this.stats.averageExecutionTime = 
      (this.stats.averageExecutionTime * (totalOps - 1) + executionTime) / totalOps;
  }
}

/**
 * Retry handler builder for fluent configuration
 */
export class RetryHandlerBuilder {
  private options: Partial<RetryOptions> = {};

  /**
   * Set maximum attempts
   * @param maxAttempts Maximum number of attempts
   * @returns Builder instance
   */
  withMaxAttempts(maxAttempts: number): RetryHandlerBuilder {
    this.options.maxAttempts = maxAttempts;
    return this;
  }

  /**
   * Set base delay
   * @param baseDelayMs Base delay in milliseconds
   * @returns Builder instance
   */
  withBaseDelay(baseDelayMs: number): RetryHandlerBuilder {
    this.options.baseDelayMs = baseDelayMs;
    return this;
  }

  /**
   * Set maximum delay
   * @param maxDelayMs Maximum delay in milliseconds
   * @returns Builder instance
   */
  withMaxDelay(maxDelayMs: number): RetryHandlerBuilder {
    this.options.maxDelayMs = maxDelayMs;
    return this;
  }

  /**
   * Set exponential base
   * @param exponentialBase Base for exponential backoff
   * @returns Builder instance
   */
  withExponentialBase(exponentialBase: number): RetryHandlerBuilder {
    this.options.exponentialBase = exponentialBase;
    return this;
  }

  /**
   * Enable or disable jitter
   * @param jitter Whether to use jitter
   * @returns Builder instance
   */
  withJitter(jitter: boolean): RetryHandlerBuilder {
    this.options.jitter = jitter;
    return this;
  }

  /**
   * Build retry handler instance
   * @returns Retry handler instance
   */
  build(): RetryHandler {
    return new RetryHandler(this.options);
  }
}

/**
 * Create retry handler with default configuration
 * @returns Retry handler instance
 */
export function createRetryHandler(): RetryHandler {
  return new RetryHandler();
}

/**
 * Create retry handler builder
 * @returns Retry handler builder
 */
export function retryHandlerBuilder(): RetryHandlerBuilder {
  return new RetryHandlerBuilder();
}

/**
 * Common retry conditions
 */
export const RetryConditions = {
  /**
   * Retry on network errors
   */
  networkErrors: (error: Error): boolean => {
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('econnrefused') ||
           message.includes('enotfound');
  },

  /**
   * Retry on temporary failures
   */
  temporaryFailures: (error: Error): boolean => {
    const message = error.message.toLowerCase();
    return message.includes('temporary') ||
           message.includes('busy') ||
           message.includes('locked') ||
           message.includes('unavailable');
  },

  /**
   * Never retry
   */
  never: (): boolean => false,

  /**
   * Always retry
   */
  always: (): boolean => true
};