import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import * as path from 'path';
import { GitService } from '../core/interfaces/GitService';
import { FileService } from '../core/interfaces/FileService';

/**
 * Implementation of GitService that handles Git operations
 */
export class GitServiceImpl implements GitService {
    private git: SimpleGit;
    private repoPath: string;
    private fileService: FileService;

    /**
     * Constructor for GitServiceImpl
     * @param repoPath Path to the git repository
     * @param fileService Service for file operations
     */
    constructor(repoPath: string, fileService: FileService) {
        this.git = simpleGit(repoPath);
        this.repoPath = repoPath;
        this.fileService = fileService;
    }

    /**
     * Check for changes in the repository, focusing on the _posts directory
     * @returns StatusResult or null if no relevant changes
     */
    public async checkForChanges(): Promise<StatusResult | null> {
        const status = await this.git.status();
        
        // Check for untracked files in _posts directory
        const postsPath = path.join(this.repoPath, 'source', '_posts');
        
        // Check if _posts directory exists
        if (this.fileService.exists(postsPath)) {
            try {
                // Get all files in the _posts directory
                const files = this.fileService.readDir(postsPath);
                
                // Process each file
                for (const file of files) {
                    if (file.endsWith('.md')) {
                        const filePath = path.join(postsPath, file);
                        
                        // Ensure file has date in front matter
                        await this.fileService.ensurePostHasDate(filePath);
                        
                        // Check if file is untracked
                        const relativePath = `source/_posts/${file}`;
                        if (!status.files.some(f => f.path === relativePath) && 
                            !status.not_added.includes(relativePath)) {
                            // Add untracked file to status
                            status.not_added.push(relativePath);
                            status.files.push({
                                path: relativePath,
                                working_dir: '?',
                                index: '?'
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing files:', error);
            }
        }

        // check if any of the changes contain '_posts' in their directory path
        const changesInPosts = status.files.some(file => /_posts/.test(file.path)) || 
                              status.not_added.some(file => /_posts/.test(file));
        
        if (changesInPosts) {
            // if there are changes in the '_posts' directory, return the status
            return status;
        } else {
            // otherwise, return null
            return null;
        }
    }

    /**
     * Commit changes with an appropriate message
     * @param status Git status containing the changes to commit
     */
    public async commitChanges(status: StatusResult): Promise<void> {
        const timestamp = new Date().toISOString();

        // Categorize files based on their status
        const addedFiles = status.created.map(file => `A: ${file}`).join(', ');
        const modifiedFiles = status.modified.map(file => `M: ${file}`).join(', ');
        const deletedFiles = status.deleted.map(file => `D: ${file}`).join(', ');
        const untrackedFiles = status.not_added.map(file => `U: ${file}`).join(', ');

        // Construct the commit message
        const commitMessage = `Changes at ${timestamp} - ${addedFiles} ${modifiedFiles} ${deletedFiles} ${untrackedFiles}`.trim();

        await this.git.add('.'); // Stage all changes
        await this.git.commit(commitMessage);
    }

    /**
     * Push committed changes to the remote repository
     */
    public async pushChanges(): Promise<void> {
        await this.git.push();
    }
} 
