// Configuration Management System

import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { 
  HexoConfig, 
  ConfigValidator, 
  Disposable 
} from '../types';
import { IConfigurationManager } from '../tokens';

export class ConfigurationManager implements IConfigurationManager, Disposable {
  private config: HexoConfig;
  private validators: ConfigValidator[] = [];
  private readonly configPath: string;
  private readonly defaultConfig: HexoConfig;

  constructor(configPath: string, defaultConfig?: Partial<HexoConfig>) {
    this.configPath = configPath;
    this.defaultConfig = this.createDefaultConfig(defaultConfig);
    this.config = { ...this.defaultConfig };
  }

  /**
   * Load configuration from file
   * @returns Promise resolving to loaded configuration
   */
  async load(): Promise<HexoConfig> {
    try {
      const rawConfig = await this.loadRawConfig();
      this.config = await this.validateAndMergeDefaults(rawConfig);
      return this.config;
    } catch (error) {
      console.warn(`Failed to load configuration from ${this.configPath}:`, error);
      this.config = { ...this.defaultConfig };
      return this.config;
    }
  }

  /**
   * Save configuration to file
   * @param config Partial configuration to save
   */
  async save(config: Partial<HexoConfig>): Promise<void> {
    const mergedConfig = this.mergeConfigs(this.config, config);
    await this.validateConfiguration(mergedConfig);
    
    this.config = mergedConfig;
    await this.saveRawConfig(this.config);
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  get(): HexoConfig {
    return { ...this.config };
  }

  /**
   * Update configuration in memory without saving
   * @param updates Partial configuration updates
   */
  update(updates: Partial<HexoConfig>): void {
    this.config = this.mergeConfigs(this.config, updates);
  }

  /**
   * Validate configuration
   * @param config Configuration to validate
   */
  async validate(config: HexoConfig): Promise<void> {
    await this.validateConfiguration(config);
  }

  /**
   * Add a configuration validator
   * @param validator Validator to add
   */
  addValidator(validator: ConfigValidator): void {
    this.validators.push(validator);
  }

  /**
   * Remove a configuration validator
   * @param validator Validator to remove
   */
  removeValidator(validator: ConfigValidator): void {
    const index = this.validators.indexOf(validator);
    if (index > -1) {
      this.validators.splice(index, 1);
    }
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = { ...this.defaultConfig };
  }

  /**
   * Check if configuration file exists
   * @returns True if configuration file exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.validators.length = 0;
  }

  /**
   * Load raw configuration from file
   * @returns Promise resolving to raw configuration
   */
  private async loadRawConfig(): Promise<any> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty object
        return {};
      }
      throw error;
    }
  }

  /**
   * Save raw configuration to file
   * @param config Configuration to save
   */
  private async saveRawConfig(config: HexoConfig): Promise<void> {
    const content = JSON.stringify(config, null, 2);
    await writeFile(this.configPath, content, 'utf-8');
  }

  /**
   * Validate configuration using all validators
   * @param config Configuration to validate
   */
  private async validateConfiguration(config: HexoConfig): Promise<void> {
    const validationPromises = this.validators.map(validator => validator.validate(config));
    await Promise.all(validationPromises);
  }

  /**
   * Validate and merge configuration with defaults
   * @param rawConfig Raw configuration from file
   * @returns Merged and validated configuration
   */
  private async validateAndMergeDefaults(rawConfig: any): Promise<HexoConfig> {
    const mergedConfig = this.mergeConfigs(this.defaultConfig, rawConfig);
    await this.validateConfiguration(mergedConfig);
    return mergedConfig;
  }

  /**
   * Deep merge two configuration objects
   * @param target Target configuration
   * @param source Source configuration
   * @returns Merged configuration
   */
  private mergeConfigs(target: HexoConfig, source: Partial<HexoConfig>): HexoConfig {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key as keyof HexoConfig];
        const targetValue = result[key as keyof HexoConfig];

        if (sourceValue !== undefined) {
          if (typeof sourceValue === 'object' && !Array.isArray(sourceValue) && 
              typeof targetValue === 'object' && !Array.isArray(targetValue)) {
            // Deep merge objects
            (result as any)[key] = { ...targetValue, ...sourceValue };
          } else {
            // Direct assignment for primitives and arrays
            (result as any)[key] = sourceValue;
          }
        }
      }
    }

    return result;
  }

  /**
   * Create default configuration
   * @param overrides Optional overrides
   * @returns Default configuration
   */
  private createDefaultConfig(overrides?: Partial<HexoConfig>): HexoConfig {
    const defaultConfig: HexoConfig = {
      paths: {
        source: '',
        posts: 'source/_posts',
        output: 'public',
        vault: ''
      },
      sync: {
        watchMode: true,
        batchSize: 10,
        debounceMs: 1000,
        retryAttempts: 3,
        retryDelayMs: 1000
      },
      git: {
        commitMessageTemplate: 'Update posts from Obsidian: {{count}} files changed',
        autoCommit: true,
        autoPush: false,
        branchName: 'main'
      },
      frontMatter: {
        autoAddDate: true,
        dateFormat: 'YYYY-MM-DD HH:mm:ss',
        requiredFields: ['title']
      }
    };

    if (overrides) {
      return this.mergeConfigs(defaultConfig, overrides);
    }

    return defaultConfig;
  }
}

/**
 * Built-in configuration validators
 */
export class PathValidator implements ConfigValidator {
  async validate(config: HexoConfig): Promise<void> {
    if (!config.paths.source) {
      throw new Error('paths.source is required');
    }
    if (!config.paths.vault) {
      throw new Error('paths.vault is required');
    }
  }
}

export class SyncValidator implements ConfigValidator {
  async validate(config: HexoConfig): Promise<void> {
    if (config.sync.batchSize <= 0) {
      throw new Error('sync.batchSize must be greater than 0');
    }
    if (config.sync.debounceMs < 0) {
      throw new Error('sync.debounceMs must be non-negative');
    }
    if (config.sync.retryAttempts < 0) {
      throw new Error('sync.retryAttempts must be non-negative');
    }
    if (config.sync.retryDelayMs < 0) {
      throw new Error('sync.retryDelayMs must be non-negative');
    }
  }
}

export class GitValidator implements ConfigValidator {
  async validate(config: HexoConfig): Promise<void> {
    if (!config.git.commitMessageTemplate) {
      throw new Error('git.commitMessageTemplate is required');
    }
    if (!config.git.branchName) {
      throw new Error('git.branchName is required');
    }
  }
}

export class FrontMatterValidator implements ConfigValidator {
  async validate(config: HexoConfig): Promise<void> {
    if (!config.frontMatter.dateFormat) {
      throw new Error('frontMatter.dateFormat is required');
    }
    if (!Array.isArray(config.frontMatter.requiredFields)) {
      throw new Error('frontMatter.requiredFields must be an array');
    }
  }
}