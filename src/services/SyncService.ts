import { Notice } from "obsidian";
import { SyncService } from "../core/interfaces/SyncService";
import { GitService } from "../core/interfaces/GitService";
import { SettingsService } from "../core/interfaces/SettingsService";
import { ErrorService, ErrorSeverity } from "../core/interfaces/ErrorService";

/**
 * Implementation of SyncService that handles automated synchronization
 */
export class SyncServiceImpl implements SyncService {
    private gitService: GitService;
    private settingsService: SettingsService;
    private errorService: ErrorService;
    private autoSyncIntervalId: NodeJS.Timeout | null = null;
    private readonly syncIntervalMs: number = 60 * 1000; // 1 minute
    private consecutiveFailures: number = 0;
    private readonly maxConsecutiveFailures: number = 5;

    /**
     * Constructor for SyncServiceImpl
     * @param gitService Service for Git operations
     * @param settingsService Service for settings management
     * @param errorService Service for error handling
     */
    constructor(
        gitService: GitService, 
        settingsService: SettingsService,
        errorService: ErrorService
    ) {
        this.gitService = gitService;
        this.settingsService = settingsService;
        this.errorService = errorService;
    }

    /**
     * Start monitoring for changes and syncing
     */
    public startSync(): void {
        try {
            // Clear any existing interval to prevent memory leaks
            this.stopSync();

            // Reset failure counter when starting sync
            this.consecutiveFailures = 0;

            // Set up new interval
            this.autoSyncIntervalId = setInterval(async () => {
                await this.handleSync();
            }, this.syncIntervalMs);
            
            this.errorService.logError(
                'Auto-sync started with interval: ' + this.syncIntervalMs + 'ms', 
                'SyncService', 
                ErrorSeverity.INFO
            );
        } catch (error) {
            this.errorService.handleError(
                error, 
                'Starting Sync', 
                ErrorSeverity.ERROR
            );
        }
    }

    /**
     * Stop monitoring for changes
     */
    public stopSync(): void {
        try {
            if (this.autoSyncIntervalId) {
                clearInterval(this.autoSyncIntervalId);
                this.autoSyncIntervalId = null;
                this.errorService.logError(
                    'Auto-sync stopped', 
                    'SyncService', 
                    ErrorSeverity.INFO
                );
            }
        } catch (error) {
            this.errorService.handleError(
                error, 
                'Stopping Sync', 
                ErrorSeverity.WARNING
            );
        }
    }

    /**
     * Handle synchronization of changes
     */
    public async handleSync(): Promise<void> {
        try {
            const status = await this.gitService.checkForChanges();
            
            if (status != null) {
                const changedFilesCount = status.created.length + 
                    status.modified.length + 
                    status.deleted.length + 
                    status.not_added.length;

                if (changedFilesCount > 0) {
                    this.errorService.logError(
                        'Changed files: ' + JSON.stringify(status.files), 
                        'SyncService', 
                        ErrorSeverity.INFO
                    );

                    // Commit and push the changes
                    try {
                        await this.gitService.commitChanges(status);
                        await this.gitService.pushChanges();
                        
                        // Reset failure counter on success
                        this.consecutiveFailures = 0;
                        
                        this.errorService.logError(
                            'Changes committed and pushed successfully.', 
                            'SyncService', 
                            ErrorSeverity.INFO
                        );
                        new Notice('Changes committed and pushed successfully.');

                    } catch (error) {
                        // Increment failure counter
                        this.consecutiveFailures++;
                        
                        // Handle error with recovery mechanism
                        await this.errorService.handleErrorWithRecovery(
                            error, 
                            'Commit and Push',
                            async () => {
                                if (this.consecutiveFailures < this.maxConsecutiveFailures) {
                                    // Wait and retry
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                    
                                    // Try commit again
                                    await this.gitService.commitChanges(status);
                                    await this.gitService.pushChanges();
                                    return true;
                                } else {
                                    // Too many failures, pause sync
                                    this.stopSync();
                                    new Notice(
                                        'Auto-sync has been paused due to multiple failures. ' +
                                        'Please check your Hexo blog configuration and restart the plugin.'
                                    );
                                    return false;
                                }
                            }
                        );
                    }
                }
            }
        } catch (error) {
            // Increment failure counter
            this.consecutiveFailures++;
            
            await this.errorService.handleErrorWithRecovery(
                error, 
                'Auto-Sync Process',
                async () => {
                    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                        // Too many consecutive failures, pause sync
                        this.stopSync();
                        new Notice(
                            'Auto-sync has been paused due to multiple failures. ' +
                            'Please check your Hexo blog configuration and restart the plugin.'
                        );
                    }
                    return false;
                }
            );
        }
    }
} 
