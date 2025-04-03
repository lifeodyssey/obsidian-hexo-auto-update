import * as fs from 'fs';
import * as path from 'path';
import { FileService } from '../core/interfaces/FileService';

/**
 * Implementation of FileService that handles file operations
 */
export class FileServiceImpl implements FileService {
    
    /**
     * Checks if a file exists
     * @param filePath Path to the file
     * @returns True if file exists, false otherwise
     */
    public exists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }
    
    /**
     * Reads a file's content
     * @param filePath Path to the file
     * @returns File content as string
     */
    public readFile(filePath: string): string {
        return fs.readFileSync(filePath, 'utf-8');
    }
    
    /**
     * Writes content to a file
     * @param filePath Path to the file
     * @param content Content to write
     */
    public writeFile(filePath: string, content: string): void {
        fs.writeFileSync(filePath, content, 'utf-8');
    }
    
    /**
     * Gets all files in a directory
     * @param dirPath Path to the directory
     * @returns Array of file names
     */
    public readDir(dirPath: string): string[] {
        return fs.readdirSync(dirPath);
    }
    
    /**
     * Ensures a post has a date in its front matter
     * @param filePath Path to the post file
     */
    public async ensurePostHasDate(filePath: string): Promise<void> {
        try {
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
                    console.log(`Added date to post: ${path.basename(filePath)}`);
                }
            } else {
                // If no front matter exists, add one with a date
                const now = new Date();
                const dateStr = now.toISOString()
                    .replace('T', ' ')
                    .replace(/\.\d+Z$/, '');
                
                const newContent = `---\ndate: ${dateStr}\n---\n\n${content}`;
                this.writeFile(filePath, newContent);
                console.log(`Added front matter with date to post: ${path.basename(filePath)}`);
            }
        } catch (error) {
            console.error(`Error processing date in post ${filePath}:`, error);
        }
    }
} 
