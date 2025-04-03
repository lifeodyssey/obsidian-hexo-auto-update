/**
 * Interface for synchronization service
 * This service coordinates file monitoring and git operations
 */
export interface SyncService {
    /**
     * Start monitoring for changes and syncing
     */
    startSync(): void;
    
    /**
     * Stop monitoring for changes
     */
    stopSync(): void;
    
    /**
     * Handle synchronization of changes
     */
    handleSync(): Promise<void>;
} 
