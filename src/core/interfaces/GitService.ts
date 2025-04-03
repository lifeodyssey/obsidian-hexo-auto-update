import { StatusResult } from 'simple-git';

/**
 * Interface for Git operations
 * This follows the Dependency Inversion Principle from SOLID
 */
export interface GitService {
    /**
     * Check for changes in the repository, focusing on the _posts directory
     * @returns StatusResult or null if no relevant changes
     */
    checkForChanges(): Promise<StatusResult | null>;
    
    /**
     * Commit changes with an appropriate message
     * @param status Git status containing the changes to commit
     */
    commitChanges(status: StatusResult): Promise<void>;
    
    /**
     * Push committed changes to the remote repository
     */
    pushChanges(): Promise<void>;
} 
