// Structured Logging System

import { 
  LogLevel, 
  LogEntry, 
  Disposable 
} from '../types';
import { ILogger } from '../tokens';

export interface LogTransport {
  write(entry: LogEntry): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export class Logger implements ILogger, Disposable {
  private transports: LogTransport[] = [];
  private minLevel: LogLevel;
  private context: Record<string, any> = {};
  private isDisposed = false;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  /**
   * Add a transport for log output
   * @param transport Log transport
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Remove a transport
   * @param transport Log transport to remove
   */
  removeTransport(transport: LogTransport): void {
    const index = this.transports.indexOf(transport);
    if (index > -1) {
      this.transports.splice(index, 1);
    }
  }

  /**
   * Set minimum log level
   * @param level Minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Set global context that will be included in all log entries
   * @param context Context object
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...context };
  }

  /**
   * Add to global context
   * @param key Context key
   * @param value Context value
   */
  addContext(key: string, value: any): void {
    this.context[key] = value;
  }

  /**
   * Remove from global context
   * @param key Context key
   */
  removeContext(key: string): void {
    delete this.context[key];
  }

  /**
   * Log debug message
   * @param message Log message
   * @param context Additional context
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, undefined, context);
  }

  /**
   * Log info message
   * @param message Log message
   * @param context Additional context
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, undefined, context);
  }

  /**
   * Log warning message
   * @param message Log message
   * @param context Additional context
   */
  warning(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARNING, message, undefined, context);
  }

  /**
   * Log error message
   * @param message Log message
   * @param error Optional error object
   * @param context Additional context
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, error, context);
  }

  /**
   * Log critical message
   * @param message Log message
   * @param error Optional error object
   * @param context Additional context
   */
  critical(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, message, error, context);
  }

  /**
   * Create a child logger with additional context
   * @param childContext Additional context for child logger
   * @returns Child logger instance
   */
  child(childContext: Record<string, any>): Logger {
    const childLogger = new Logger(this.minLevel);
    childLogger.transports = [...this.transports];
    childLogger.context = { ...this.context, ...childContext };
    return childLogger;
  }

  /**
   * Flush all transports
   */
  async flush(): Promise<void> {
    const flushPromises = this.transports
      .filter(transport => transport.flush)
      .map(transport => transport.flush!());
    
    await Promise.allSettled(flushPromises);
  }

  /**
   * Dispose logger and close all transports
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    
    await this.flush();
    
    const closePromises = this.transports
      .filter(transport => transport.close)
      .map(transport => transport.close!());
    
    await Promise.allSettled(closePromises);
    
    this.transports.length = 0;
  }

  /**
   * Core logging method
   * @param level Log level
   * @param message Log message
   * @param error Optional error object
   * @param context Additional context
   */
  private log(level: LogLevel, message: string, error?: Error, context?: Record<string, any>): void {
    if (this.isDisposed) {
      return;
    }

    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: { ...this.context, ...context },
      error
    };

    // Write to all transports
    this.transports.forEach(transport => {
      transport.write(entry).catch(error => {
        console.error('Error writing to log transport:', error);
      });
    });
  }

  /**
   * Check if log level should be logged
   * @param level Log level to check
   * @returns True if should log
   */
  private shouldLog(level: LogLevel): boolean {
    const levelOrder = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARNING,
      LogLevel.ERROR,
      LogLevel.CRITICAL
    ];

    const currentLevelIndex = levelOrder.indexOf(this.minLevel);
    const logLevelIndex = levelOrder.indexOf(level);

    return logLevelIndex >= currentLevelIndex;
  }
}

/**
 * Console transport for development
 */
export class ConsoleTransport implements LogTransport {
  private colors: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '\x1b[36m',    // Cyan
    [LogLevel.INFO]: '\x1b[32m',     // Green
    [LogLevel.WARNING]: '\x1b[33m',  // Yellow
    [LogLevel.ERROR]: '\x1b[31m',    // Red
    [LogLevel.CRITICAL]: '\x1b[35m'  // Magenta
  };

  private reset = '\x1b[0m';

  constructor(private useColors: boolean = true) {}

  async write(entry: LogEntry): Promise<void> {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.padEnd(8);
    const message = entry.message;
    
    let logMessage = `${timestamp} [${level}] ${message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      logMessage += ` ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      logMessage += `\n${entry.error.stack || entry.error.message}`;
    }

    if (this.useColors && this.colors[entry.level]) {
      logMessage = `${this.colors[entry.level]}${logMessage}${this.reset}`;
    }

    // Use appropriate console method
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARNING:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(logMessage);
        break;
    }
  }
}

/**
 * File transport for persistent logging
 */
export class FileTransport implements LogTransport {
  private writeStream: any;
  private buffer: LogEntry[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(
    private filePath: string,
    private bufferSize: number = 100,
    private flushIntervalMs: number = 5000
  ) {
    this.initializeStream();
    this.startFlushInterval();
  }

  async write(entry: LogEntry): Promise<void> {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    try {
      const lines = this.buffer.map(entry => {
        const logObj = {
          timestamp: entry.timestamp.toISOString(),
          level: entry.level,
          message: entry.message,
          context: entry.context,
          error: entry.error ? {
            message: entry.error.message,
            stack: entry.error.stack
          } : undefined
        };
        
        return JSON.stringify(logObj);
      });

      await this.writeToFile(lines.join('\n') + '\n');
      this.buffer.length = 0;
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    await this.flush();
    
    if (this.writeStream) {
      this.writeStream.close();
    }
  }

  private initializeStream(): void {
    // This would need to be implemented based on the environment
    // For now, we'll use a simple file writing approach
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch(error => {
        console.error('Error during scheduled flush:', error);
      });
    }, this.flushIntervalMs);
  }

  private async writeToFile(content: string): Promise<void> {
    // This would need proper file system integration
    // For now, we'll just log to console as fallback
    console.log(`[FILE LOG] ${content}`);
  }
}

/**
 * Memory transport for testing and debugging
 */
export class MemoryTransport implements LogTransport {
  private entries: LogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  async write(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
    
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(entry => entry.level === level);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/**
 * Global logger instance
 */
export const globalLogger = new Logger(LogLevel.INFO);

// Add console transport by default
globalLogger.addTransport(new ConsoleTransport());