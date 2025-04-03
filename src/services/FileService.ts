import * as fs from 'fs';
import * as path from 'path';
import { FileService } from '../core/interfaces/FileService';
import { ErrorService, ErrorSeverity } from '../core/interfaces/ErrorService';
import { ErrorServiceImpl } from './ErrorService';

/**
 * Custom error class for file operations
 */
class FileOperationError extends Error {
    constructor(message: string, public readonly path: string, public readonly cause?: Error) {
        super(message);
        this.name = 'FileOperationError';
    }
}

/**
 * Implementation of FileService that handles file operations
 */
export class FileServiceImpl implements FileService {
    private errorService: ErrorService;
    
    constructor() {
        this.errorService = ErrorServiceImpl.getInstance();
    }
    
    /**
     * Checks if a file exists
     * @param filePath Path to the file
     * @returns True if file exists, false otherwise
     */
    public exists(filePath: string): boolean {
        try {
            return fs.existsSync(filePath);
        } catch (error) {
            this.errorService.logError(
                error,
                `Checking if file exists: ${filePath}`,
                ErrorSeverity.WARNING
            );
            return false;
        }
    }
    
    /**
     * Reads a file's content
     * @param filePath Path to the file
     * @returns File content as string
     */
    public readFile(filePath: string): string {
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            throw new FileOperationError(
                `Failed to read file: ${filePath}`,
                filePath,
                error instanceof Error ? error : undefined
            );
        }
    }
    
    /**
     * Writes content to a file
     * @param filePath Path to the file
     * @param content Content to write
     */
    public writeFile(filePath: string, content: string): void {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!this.exists(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(filePath, content, 'utf-8');
        } catch (error) {
            throw new FileOperationError(
                `Failed to write to file: ${filePath}`,
                filePath,
                error instanceof Error ? error : undefined
            );
        }
    }
    
    /**
     * Gets all files in a directory
     * @param dirPath Path to the directory
     * @returns Array of file names
     */
    public readDir(dirPath: string): string[] {
        try {
            return fs.readdirSync(dirPath);
        } catch (error) {
            throw new FileOperationError(
                `Failed to read directory: ${dirPath}`,
                dirPath,
                error instanceof Error ? error : undefined
            );
        }
    }
    
    /**
     * Ensures a post has a date in its front matter
     * @param filePath Path to the post file
     */
    public async ensurePostHasDate(filePath: string): Promise<void> {
        try {
            if (!this.exists(filePath)) {
                throw new FileOperationError(
                    `Post file does not exist: ${filePath}`,
                    filePath
                );
            }
            
            const content = this.readFile(filePath);
            
            // Check if the file has front matter
            if (content.startsWith('---')) {
                const frontMatter = content.split('---')[1];
                
                // Check if the front matter already has a date field
                if (!frontMatter.includes('date:')) {
                    // Create date string in Hexo format (YYYY-MM-DD HH:mm:ss)
                    const now = new Date();
                    const dateStr = now.toISOString()
                        .replace('T', ' ')
                        .replace(/\.\d+Z$/, '');
                    
                    // Add date to front matter
                    const newContent = content.replace('---', `---\ndate: ${dateStr}`);
                    
                    // Write updated content back to file
                    this.writeFile(filePath, newContent);
                    this.errorService.logError(
                        `Added date to post: ${path.basename(filePath)}`,
                        'Front Matter Update',
                        ErrorSeverity.INFO
                    );
                }
            } else {
                // If no front matter exists, add one with a date
                const now = new Date();
                const dateStr = now.toISOString()
                    .replace('T', ' ')
                    .replace(/\.\d+Z$/, '');
                
                const newContent = `---\ndate: ${dateStr}\n---\n\n${content}`;
                this.writeFile(filePath, newContent);
                this.errorService.logError(
                    `Added front matter with date to post: ${path.basename(filePath)}`,
                    'Front Matter Creation',
                    ErrorSeverity.INFO
                );
            }
        } catch (error) {
            // If it's already a FileOperationError, just rethrow
            if (error instanceof FileOperationError) {
                throw error;
            }
            
            // Otherwise, wrap it
            throw new FileOperationError(
                `Error processing date in post: ${filePath}`,
                filePath,
                error instanceof Error ? error : undefined
            );
        }
    }
} 
