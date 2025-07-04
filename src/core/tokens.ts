// Service Tokens for Dependency Injection

import { ServiceToken } from './types';

// Core Services
export const TOKENS = {
  // Configuration Services
  ConfigurationManager: {
    name: 'ConfigurationManager',
    type: 'IConfigurationManager'
  } as ServiceToken<IConfigurationManager>,

  // Event Services
  EventBus: {
    name: 'EventBus',
    type: 'IEventBus'
  } as ServiceToken<IEventBus>,

  // Logging Services
  Logger: {
    name: 'Logger',
    type: 'ILogger'
  } as ServiceToken<ILogger>,

  // File Services
  FileWatcherService: {
    name: 'FileWatcherService',
    type: 'IFileWatcherService'
  } as ServiceToken<IFileWatcherService>,

  // Content Processing Services
  ContentProcessor: {
    name: 'ContentProcessor',
    type: 'IContentProcessor'
  } as ServiceToken<IContentProcessor>,

  FrontMatterProcessor: {
    name: 'FrontMatterProcessor',
    type: 'IFrontMatterProcessor'
  } as ServiceToken<IFrontMatterProcessor>,

  // Git Services
  GitOperations: {
    name: 'GitOperations',
    type: 'IGitOperations'
  } as ServiceToken<IGitOperations>,

  // Synchronization Services
  SynchronizationService: {
    name: 'SynchronizationService',
    type: 'ISynchronizationService'
  } as ServiceToken<ISynchronizationService>,

  // Error Handling Services
  ErrorHandler: {
    name: 'ErrorHandler',
    type: 'IErrorHandler'
  } as ServiceToken<IErrorHandler>,

  CircuitBreaker: {
    name: 'CircuitBreaker',
    type: 'ICircuitBreaker'
  } as ServiceToken<ICircuitBreaker>,

  RetryHandler: {
    name: 'RetryHandler',
    type: 'IRetryHandler'
  } as ServiceToken<IRetryHandler>,

  // File System Services
  FileService: {
    name: 'FileService',
    type: 'IFileService'
  } as ServiceToken<IFileService>,

  // Settings Services
  SettingsService: {
    name: 'SettingsService',
    type: 'ISettingsService'
  } as ServiceToken<ISettingsService>,

  // Symlink Services
  SymlinkService: {
    name: 'SymlinkService',
    type: 'ISymlinkService'
  } as ServiceToken<ISymlinkService>
};

// Type definitions for service interfaces
export interface IConfigurationManager {
  load(): Promise<import('./types').HexoConfig>;
  save(config: Partial<import('./types').HexoConfig>): Promise<void>;
  get(): import('./types').HexoConfig;
  validate(config: import('./types').HexoConfig): Promise<void>;
}

export interface IEventBus {
  subscribe<T>(eventType: string, handler: import('./types').EventHandler<T>): void;
  publish(event: import('./types').Event): Promise<void>;
  dispose(): Promise<void>;
}

export interface ILogger {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warning(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  critical(message: string, error?: Error, context?: Record<string, any>): void;
}

export interface IFileWatcherService {
  watch(path: string, options?: import('./types').WatchOptions): import('rxjs').Observable<import('./types').FileChangeEvent>;
  watchMultiple(paths: string[], options?: import('./types').WatchOptions): import('rxjs').Observable<import('./types').FileChangeEvent>;
  dispose(): Promise<void>;
}

export interface IContentProcessor {
  process(content: string, options: import('./types').ProcessingOptions): Promise<string>;
  validate(content: string): Promise<import('./types').ValidationResult>;
  extract(content: string): Promise<import('./types').FrontMatter>;
}

export interface IFrontMatterProcessor {
  process(content: string, options: import('./types').ProcessingOptions): Promise<string>;
  validate(content: string): Promise<import('./types').ValidationResult>;
  extract(content: string): Promise<import('./types').FrontMatter>;
}

export interface IGitOperations {
  status(): Promise<import('./types').GitStatus>;
  add(files: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(remote?: string, branch?: string): Promise<void>;
  pull(): Promise<void>;
  isRepository(): Promise<boolean>;
}

export interface ISynchronizationService {
  start(): Promise<void>;
  stop(): Promise<void>;
  syncNow(): Promise<import('./types').SyncResult>;
  getStatus(): import('./types').SyncStatus;
}

export interface IErrorHandler {
  handleError(error: Error, context: string): Promise<void>;
  handleErrorWithRecovery(error: Error, context: string, recovery: import('./types').RecoveryAction): Promise<void>;
}

export interface ICircuitBreaker {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  getState(): import('./types').CircuitState;
  reset(): void;
}

export interface IRetryHandler {
  executeWithRetry<T>(operation: () => Promise<T>, context: string): Promise<T>;
}

export interface IFileService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
  getStats(path: string): Promise<{ size: number; mtime: Date }>;
}

export interface ISettingsService {
  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
  getSettings(): import('../types').HexoIntegrationSettings;
  updateSettings(settings: Partial<import('../types').HexoIntegrationSettings>): Promise<void>;
}

export interface ISymlinkService {
  createSystemSpecificSymlink(targetPath: string): Promise<string>;
  validateSymlink(targetPath: string): Promise<void>;
  removeSymlink(symlinkPath: string): Promise<void>;
}