import { Notice } from "obsidian";
import { SyncService } from "../core/interfaces/SyncService";
import { GitService } from "../core/interfaces/GitService";
import { SettingsService } from "../core/interfaces/SettingsService";

/**
 * Implementation of SyncService that handles automated synchronization
 */
export class SyncServiceImpl implements SyncService {
    private gitService: GitService;
    private settingsService: SettingsService;
    private autoSyncIntervalId: NodeJS.Timeout | null = null;
    private readonly syncIntervalMs: number = 60 * 1000; // 1 minute

    /**
     * Constructor for SyncServiceImpl
     * @param gitService Service for Git operations
     * @param settingsService Service for settings management
     */
    constructor(gitService: GitService, settingsService: SettingsService) {
        this.gitService = gitService;
        this.settingsService = settingsService;
    }

    /**
     * Start monitoring for changes and syncing
     */
    public startSync(): void {
        // Clear any existing interval to prevent memory leaks
        this.stopSync();

        // Set up new interval
        this.autoSyncIntervalId = setInterval(async () => {
            await this.handleSync();
        }, this.syncIntervalMs);
        
        console.log('Auto-sync started with interval:', this.syncIntervalMs, 'ms');
    }

    /**
     * Stop monitoring for changes
     */
    public stopSync(): void {
        if (this.autoSyncIntervalId) {
            clearInterval(this.autoSyncIntervalId);
            this.autoSyncIntervalId = null;
            console.log('Auto-sync stopped');
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
                    console.log('Changed files:', status.files);

                    // Commit and push the changes
                    try {
                        await this.gitService.commitChanges(status);
                        await this.gitService.pushChanges();
                        console.log('Changes committed and pushed successfully.');
                        new Notice('Changes committed and pushed successfully.');

                    } catch (error) {
                        console.error('Error during commit and push:', error);
                        new Notice(`Error during commit and push: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error in auto-sync:', error);
            new Notice(`Error in auto-sync: ${error.message}`);
        }
    }
} 
