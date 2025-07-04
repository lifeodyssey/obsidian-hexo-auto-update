// Migration Utilities for Architecture Transition

import { App } from "obsidian";
import { join } from "path";
import { HexoConfig } from "../core/types";
import { HexoIntegrationSettings } from "../types";
import { DEFAULT_SETTINGS } from "../constants";
import { ConfigurationManager } from "../core/config";
import { globalLogger } from "../core/logging";

export interface MigrationResult {
  success: boolean;
  migratedSettings: boolean;
  migratedConfig: boolean;
  backupCreated: boolean;
  errors: string[];
  warnings: string[];
}

export interface MigrationOptions {
  createBackup: boolean;
  validateAfterMigration: boolean;
  preserveLegacySettings: boolean;
}

export class MigrationUtilities {
  private app: App;
  private logger = globalLogger;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Perform complete migration from legacy to new architecture
   */
  async migrate(options: MigrationOptions = {
    createBackup: true,
    validateAfterMigration: true,
    preserveLegacySettings: true
  }): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedSettings: false,
      migratedConfig: false,
      backupCreated: false,
      errors: [],
      warnings: []
    };

    try {
      this.logger.info('Starting migration from legacy architecture');

      // Step 1: Create backup if requested
      if (options.createBackup) {
        try {
          await this.createBackup();
          result.backupCreated = true;
          this.logger.info('Backup created successfully');
        } catch (error) {
          result.warnings.push(`Failed to create backup: ${error.message}`);
          this.logger.warning('Failed to create backup', undefined, { error: error.message });
        }
      }

      // Step 2: Load legacy settings
      const legacySettings = await this.loadLegacySettings();
      if (!legacySettings) {
        result.warnings.push('No legacy settings found to migrate');
        this.logger.info('No legacy settings found, using defaults');
      }

      // Step 3: Migrate to new configuration format
      try {
        const hexoConfig = this.convertLegacyToNewConfig(legacySettings || DEFAULT_SETTINGS);
        await this.saveNewConfiguration(hexoConfig);
        result.migratedConfig = true;
        this.logger.info('Configuration migrated successfully');
      } catch (error) {
        result.errors.push(`Failed to migrate configuration: ${error.message}`);
        this.logger.error('Configuration migration failed', error);
      }

      // Step 4: Validate migrated configuration
      if (options.validateAfterMigration && result.migratedConfig) {
        try {
          await this.validateMigratedConfiguration();
          this.logger.info('Migrated configuration validated successfully');
        } catch (error) {
          result.warnings.push(`Configuration validation failed: ${error.message}`);
          this.logger.warning('Configuration validation failed', undefined, { error: error.message });
        }
      }

      // Step 5: Clean up or preserve legacy settings
      if (!options.preserveLegacySettings && result.migratedConfig) {
        try {
          await this.cleanupLegacySettings();
          this.logger.info('Legacy settings cleaned up');
        } catch (error) {
          result.warnings.push(`Failed to cleanup legacy settings: ${error.message}`);
        }
      }

      result.success = result.migratedConfig;
      result.migratedSettings = true;

      this.logger.info('Migration completed', {
        success: result.success,
        errors: result.errors.length,
        warnings: result.warnings.length
      });

      return result;

    } catch (error) {
      result.errors.push(`Migration failed: ${error.message}`);
      this.logger.error('Migration process failed', error);
      return result;
    }
  }

  /**
   * Check if migration is needed
   */
  async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if new configuration exists
      const configPath = join(this.app.vault.configDir, 'hexo-integration.json');
      const configManager = new ConfigurationManager(configPath);
      
      const hasNewConfig = await configManager.exists();
      if (hasNewConfig) {
        return false; // Already migrated
      }

      // Check if legacy settings exist
      const legacySettings = await this.loadLegacySettings();
      return legacySettings !== null;

    } catch (error) {
      this.logger.error('Error checking migration status', error);
      return true; // Assume migration needed if we can't determine
    }
  }

  /**
   * Get migration status and recommendations
   */
  async getMigrationStatus(): Promise<{
    needsMigration: boolean;
    hasLegacySettings: boolean;
    hasNewConfig: boolean;
    recommendations: string[];
  }> {
    const status = {
      needsMigration: false,
      hasLegacySettings: false,
      hasNewConfig: false,
      recommendations: [] as string[]
    };

    try {
      // Check for legacy settings
      const legacySettings = await this.loadLegacySettings();
      status.hasLegacySettings = legacySettings !== null;

      // Check for new configuration
      const configPath = join(this.app.vault.configDir, 'hexo-integration.json');
      const configManager = new ConfigurationManager(configPath);
      status.hasNewConfig = await configManager.exists();

      // Determine migration need
      status.needsMigration = status.hasLegacySettings && !status.hasNewConfig;

      // Generate recommendations
      if (status.needsMigration) {
        status.recommendations.push('Migration to new architecture is recommended');
        status.recommendations.push('Create backup before migrating');
        status.recommendations.push('Validate configuration after migration');
      } else if (status.hasNewConfig && status.hasLegacySettings) {
        status.recommendations.push('Both legacy and new configurations found');
        status.recommendations.push('Consider cleaning up legacy settings');
      } else if (!status.hasLegacySettings && !status.hasNewConfig) {
        status.recommendations.push('No configuration found');
        status.recommendations.push('Set up configuration through settings');
      }

      return status;

    } catch (error) {
      this.logger.error('Error getting migration status', error);
      status.recommendations.push('Error checking migration status');
      return status;
    }
  }

  /**
   * Create backup of current settings
   */
  private async createBackup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(this.app.vault.configDir, `hexo-integration-backup-${timestamp}.json`);

      // Load current plugin data
      const pluginData = await this.app.vault.adapter.read(
        join(this.app.vault.configDir, 'plugins', 'hexo-auto-updater', 'data.json')
      );

      // Save backup
      await this.app.vault.adapter.write(backupPath, pluginData);
      
      this.logger.info('Backup created', { backupPath });

    } catch (error) {
      // If the file doesn't exist, that's OK - nothing to backup
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Load legacy settings
   */
  private async loadLegacySettings(): Promise<HexoIntegrationSettings | null> {
    try {
      const dataPath = join(this.app.vault.configDir, 'plugins', 'hexo-auto-updater', 'data.json');
      const data = await this.app.vault.adapter.read(dataPath);
      return JSON.parse(data) as HexoIntegrationSettings;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Convert legacy settings to new configuration format
   */
  private convertLegacyToNewConfig(settings: HexoIntegrationSettings): HexoConfig {
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
   * Save new configuration
   */
  private async saveNewConfiguration(config: HexoConfig): Promise<void> {
    const configPath = join(this.app.vault.configDir, 'hexo-integration.json');
    const configManager = new ConfigurationManager(configPath);
    
    await configManager.save(config);
  }

  /**
   * Validate migrated configuration
   */
  private async validateMigratedConfiguration(): Promise<void> {
    const configPath = join(this.app.vault.configDir, 'hexo-integration.json');
    const configManager = new ConfigurationManager(configPath);
    
    const config = await configManager.load();
    await configManager.validate(config);
  }

  /**
   * Clean up legacy settings
   */
  private async cleanupLegacySettings(): Promise<void> {
    try {
      const dataPath = join(this.app.vault.configDir, 'plugins', 'hexo-auto-updater', 'data.json');
      
      // Move to cleanup folder instead of deleting
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cleanupPath = join(this.app.vault.configDir, `hexo-integration-legacy-${timestamp}.json`);
      
      const data = await this.app.vault.adapter.read(dataPath);
      await this.app.vault.adapter.write(cleanupPath, data);
      await this.app.vault.adapter.remove(dataPath);
      
      this.logger.info('Legacy settings moved to cleanup folder', { cleanupPath });

    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * Backwards compatibility adapter
 */
export class BackwardsCompatibilityAdapter {
  private app: App;
  private logger = globalLogger;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Check if running in compatibility mode
   */
  isCompatibilityModeEnabled(): boolean {
    // Check if both architectures are present
    try {
      // This would check for specific compatibility flags or configurations
      return true; // For now, always enable compatibility
    } catch (error) {
      return false;
    }
  }

  /**
   * Bridge legacy service calls to new architecture
   */
  createLegacyServiceBridge(): {
    wrapGitService: (newGitOps: any) => any;
    wrapSyncService: (newSync: any) => any;
    wrapFileService: (newFileWatcher: any) => any;
  } {
    return {
      wrapGitService: (newGitOps) => ({
        checkForChanges: async () => {
          const status = await newGitOps.status();
          // Convert new status format to legacy format
          return this.convertGitStatus(status);
        },
        commitChanges: async (status: any) => {
          const message = `Changes at ${new Date().toISOString()}`;
          await newGitOps.commit(message);
        },
        pushChanges: async () => {
          await newGitOps.push();
        }
      }),

      wrapSyncService: (newSync) => ({
        startSync: () => newSync.start(),
        stopSync: () => newSync.stop(),
        handleSync: () => newSync.syncNow()
      }),

      wrapFileService: (newFileWatcher) => ({
        // Legacy file service bridge methods
        exists: (path: string) => {
          // Implementation for backwards compatibility
          return true;
        },
        readDir: (path: string) => {
          // Implementation for backwards compatibility
          return [];
        }
      })
    };
  }

  /**
   * Convert new git status format to legacy format
   */
  private convertGitStatus(newStatus: any): any {
    // Convert the new GitStatus format to the legacy StatusResult format
    return {
      created: newStatus.untracked || [],
      modified: newStatus.modified || [],
      deleted: newStatus.deleted || [],
      not_added: newStatus.untracked || [],
      staged: newStatus.staged || [],
      conflicted: newStatus.conflicted || [],
      ahead: newStatus.ahead || 0,
      behind: newStatus.behind || 0,
      current: newStatus.current || '',
      tracking: newStatus.tracking || '',
      files: [
        ...newStatus.modified.map((file: string) => ({ path: file, index: 'M', working_dir: ' ' })),
        ...newStatus.untracked.map((file: string) => ({ path: file, index: ' ', working_dir: '?' }))
      ],
      renamed: [],
      isClean: () => newStatus.modified.length === 0 && newStatus.untracked.length === 0,
      detached: false
    };
  }
}

/**
 * Migration progress tracker
 */
export class MigrationProgressTracker {
  private steps: { name: string; completed: boolean; error?: string }[] = [];
  private onProgress?: (progress: number, step: string) => void;

  constructor(onProgress?: (progress: number, step: string) => void) {
    this.onProgress = onProgress;
  }

  addStep(name: string): void {
    this.steps.push({ name, completed: false });
  }

  completeStep(name: string, error?: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) {
      step.completed = true;
      step.error = error;
      
      if (this.onProgress) {
        const progress = this.getProgress();
        this.onProgress(progress, name);
      }
    }
  }

  getProgress(): number {
    const completed = this.steps.filter(s => s.completed).length;
    return this.steps.length > 0 ? (completed / this.steps.length) * 100 : 0;
  }

  getSteps(): { name: string; completed: boolean; error?: string }[] {
    return [...this.steps];
  }

  hasErrors(): boolean {
    return this.steps.some(s => s.error);
  }

  getErrors(): string[] {
    return this.steps.filter(s => s.error).map(s => s.error!);
  }
}