/**
 * Interface for file operations
 * This follows the Single Responsibility Principle from SOLID
 */
export interface FileService {
    /**
     * Checks if a file exists
     * @param filePath Path to the file
     * @returns True if file exists, false otherwise
     */
    exists(filePath: string): boolean;
    
    /**
     * Reads a file's content
     * @param filePath Path to the file
     * @returns File content as string
     */
    readFile(filePath: string): string;
    
    /**
     * Writes content to a file
     * @param filePath Path to the file
     * @param content Content to write
     */
    writeFile(filePath: string, content: string): void;
    
    /**
     * Gets all files in a directory
     * @param dirPath Path to the directory
     * @returns Array of file names
     */
    readDir(dirPath: string): string[];
    
    /**
     * Ensures a post has a date in its front matter
     * @param filePath Path to the post file
     */
    ensurePostHasDate(filePath: string): Promise<void>;
} 
