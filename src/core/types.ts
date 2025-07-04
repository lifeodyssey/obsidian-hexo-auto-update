// Core Architecture Types for Obsidian-Hexo Integration Plugin

// Service Token System
export interface ServiceToken<T> {
  readonly name: string;
  readonly type: string;
}

export interface ServiceFactory<T> {
  (): T;
}

export interface ServiceRegistration<T> {
  factory: ServiceFactory<T>;
  lifecycle: 'singleton' | 'transient';
}

// Event System Types
export interface Event<T = any> {
  type: string;
  timestamp: Date;
  payload: T;
}

export interface EventHandler<T = any> {
  handle(event: Event<T>): Promise<void>;
}

// Configuration Types
export interface HexoConfig {
  paths: {
    source: string;
    posts: string;
    output: string;
    vault: string;
  };
  sync: {
    watchMode: boolean;
    batchSize: number;
    debounceMs: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
  git: {
    commitMessageTemplate: string;
    autoCommit: boolean;
    autoPush: boolean;
    branchName: string;
  };
  frontMatter: {
    autoAddDate: boolean;
    dateFormat: string;
    requiredFields: string[];
  };
}

export interface ConfigValidator {
  validate(config: HexoConfig): Promise<void>;
}

// File System Types
export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  timestamp: Date;
  metadata?: {
    size: number;
    mtime: Date;
  };
}

export interface WatchOptions {
  extensions?: string[];
  ignored?: string[];
  recursive?: boolean;
  persistent?: boolean;
  debounceMs?: number;
}

// Content Processing Types
export interface FrontMatter {
  [key: string]: any;
  title?: string;
  date?: string;
  tags?: string[];
  categories?: string[];
}

export interface ProcessingOptions {
  validateFrontMatter?: boolean;
  autoAddDate?: boolean;
  dateFormat?: string;
  requiredFields?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

// Git Operations Types
export interface GitStatus {
  current: string;
  tracking: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  deleted: string[];
  untracked: string[];
  conflicted: string[];
}

// Synchronization Types
export interface SyncResult {
  success: boolean;
  processedFiles: string[];
  errors: string[];
  timestamp: Date;
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync: Date | null;
  totalProcessed: number;
  errors: number;
}

// Resilience Types
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitter: boolean;
}

// Error Handling Types
export interface ErrorContext {
  operation: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RecoveryAction {
  (): Promise<boolean>;
}

// Logging Types
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  error?: Error;
}

// Service Container Types
export interface ServiceContainer {
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  resolve<T>(token: ServiceToken<T>): T;
  dispose(): Promise<void>;
}

// Disposable Resource Types
export interface Disposable {
  dispose(): Promise<void>;
}

// Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;