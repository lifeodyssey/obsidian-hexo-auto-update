// Circuit Breaker Pattern Implementation

import { CircuitState, Disposable } from '../types';
import { ICircuitBreaker } from '../tokens';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
  halfOpenMaxCalls: number;
  monitoringTimeWindowMs: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  totalExecutions: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker implements ICircuitBreaker, Disposable {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private totalExecutions = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private halfOpenCalls = 0;
  
  private readonly config: CircuitBreakerConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private isDisposed = false;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      recoveryTimeMs: config.recoveryTimeMs || 60000,
      halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
      monitoringTimeWindowMs: config.monitoringTimeWindowMs || 300000 // 5 minutes
    };
    
    this.startMonitoring();
  }

  /**
   * Execute an operation with circuit breaker protection
   * @param operation Operation to execute
   * @returns Promise resolving to operation result
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isDisposed) {
      throw new Error('Circuit breaker is disposed');
    }

    this.totalExecutions++;

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new Error('Circuit breaker is HALF_OPEN - max calls exceeded');
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   * @returns Current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   * @returns Circuit breaker stats
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      totalExecutions: this.totalExecutions,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
  }

  /**
   * Force circuit breaker to closed state
   */
  forceClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  /**
   * Check if circuit breaker is healthy
   * @returns True if healthy (closed or half-open)
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN;
  }

  /**
   * Get failure rate over the monitoring window
   * @returns Failure rate as percentage
   */
  getFailureRate(): number {
    if (this.totalExecutions === 0) {
      return 0;
    }
    return (this.totalFailures / this.totalExecutions) * 100;
  }

  /**
   * Dispose circuit breaker and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED;
        this.halfOpenCalls = 0;
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state should open the circuit
      this.state = CircuitState.OPEN;
      this.halfOpenCalls = 0;
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
      }
    }
  }

  /**
   * Check if we should attempt to reset from OPEN to HALF_OPEN
   * @returns True if should attempt reset
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime > this.config.recoveryTimeMs;
  }

  /**
   * Start monitoring and periodic cleanup
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.performPeriodicMaintenance();
    }, this.config.monitoringTimeWindowMs);
  }

  /**
   * Perform periodic maintenance tasks
   */
  private performPeriodicMaintenance(): void {
    // Reset counters periodically to prevent overflow
    // and to allow for recovery from historical failures
    const now = Date.now();
    
    if (now - this.lastFailureTime > this.config.monitoringTimeWindowMs) {
      // If we haven't seen failures in a while, reset failure count
      if (this.state === CircuitState.CLOSED && this.failureCount > 0) {
        this.failureCount = Math.max(0, this.failureCount - 1);
      }
    }
  }
}

/**
 * Circuit breaker builder for fluent configuration
 */
export class CircuitBreakerBuilder {
  private config: Partial<CircuitBreakerConfig> = {};

  /**
   * Set failure threshold
   * @param threshold Number of failures before opening
   * @returns Builder instance
   */
  withFailureThreshold(threshold: number): CircuitBreakerBuilder {
    this.config.failureThreshold = threshold;
    return this;
  }

  /**
   * Set recovery time
   * @param timeMs Recovery time in milliseconds
   * @returns Builder instance
   */
  withRecoveryTime(timeMs: number): CircuitBreakerBuilder {
    this.config.recoveryTimeMs = timeMs;
    return this;
  }

  /**
   * Set half-open max calls
   * @param maxCalls Maximum calls in half-open state
   * @returns Builder instance
   */
  withHalfOpenMaxCalls(maxCalls: number): CircuitBreakerBuilder {
    this.config.halfOpenMaxCalls = maxCalls;
    return this;
  }

  /**
   * Set monitoring window
   * @param timeMs Monitoring window in milliseconds
   * @returns Builder instance
   */
  withMonitoringWindow(timeMs: number): CircuitBreakerBuilder {
    this.config.monitoringTimeWindowMs = timeMs;
    return this;
  }

  /**
   * Build circuit breaker instance
   * @returns Circuit breaker instance
   */
  build(): CircuitBreaker {
    return new CircuitBreaker(this.config);
  }
}

/**
 * Create circuit breaker with default configuration
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker();
}

/**
 * Create circuit breaker builder
 * @returns Circuit breaker builder
 */
export function circuitBreakerBuilder(): CircuitBreakerBuilder {
  return new CircuitBreakerBuilder();
}