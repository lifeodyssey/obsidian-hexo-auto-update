/**
 * Interface for Symlink operations
 * This follows the Dependency Inversion Principle from SOLID
 */
export interface SymlinkService {
    /**
     * Create a system-specific symlink to the Hexo blog
     * @param hexoSourcePath Path to the Hexo blog source
     * @returns Result status string
     */
    createSystemSpecificSymlink(hexoSourcePath: string): Promise<string>;
    
    /**
     * Validate that the symlink to the Hexo blog exists and is correct
     * @param hexoSourcePath Path to the Hexo blog source
     */
    validateSymlink(hexoSourcePath: string): Promise<void>;
} 
