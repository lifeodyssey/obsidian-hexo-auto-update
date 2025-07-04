import { simpleGit, SimpleGit } from 'simple-git';
import type { StatusResult } from 'simple-git';
import * as path from 'path';
import { GitService } from '../core/interfaces/GitService';
import { FileService } from '../core/interfaces/FileService';
import type { ErrorService } from '../core/interfaces/ErrorService';
import { ErrorSeverity } from '../core/interfaces/ErrorService';
import { ErrorServiceImpl } from './ErrorService';
import { handleError } from '../core/decorators';

/**
 * Custom error class for Git operations
 */
class GitOperationError extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'GitOperationError';
    }
}

/**
 * Implementation of GitService that handles Git operations
 */
export class GitServiceImpl implements GitService {
    private git: SimpleGit;
    private repoPath: string;
    private fileService: FileService;
    private errorService: ErrorService;

    /**
     * Constructor for GitServiceImpl
     * @param repoPath Path to the git repository
     * @param fileService Service for file operations
     */
    constructor(repoPath: string, fileService: FileService) {
        this.repoPath = repoPath;
        this.fileService = fileService;
        this.errorService = ErrorServiceImpl.getInstance();
        
        try {
            // Initialize git instance
            this.git = simpleGit(repoPath);
        } catch (error) {
            throw new GitOperationError(
                `Failed to initialize Git repository at ${repoPath}`, 
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Check for changes in the repository, focusing on the _posts directory
     * @returns StatusResult or null if no relevant changes
     */
    @handleError('Git Service', ErrorSeverity.ERROR, GitOperationError)
    public async checkForChanges(): Promise<StatusResult | null> {
        const status = await this.git.status();
        const postsPath = path.join(this.repoPath, 'source', '_posts');
        
        await this.processPostsDirectory(postsPath, status);

        return this.hasChangesInPosts(status) ? status : null;
    }

    /**
     * Process the _posts directory to find and handle markdown files
     * @param postsPath Path to the _posts directory
     * @param status Current git status
     */
    private async processPostsDirectory(postsPath: string, status: StatusResult): Promise<void> {
        // Check if _posts directory exists
        if (!this.fileService.exists(postsPath)) {
            this.errorService.logWarning(
                `Posts directory not found: ${postsPath}`, 
                'Git Status Check'
            );
            return;
        }

        const files = this.fileService.readDir(postsPath);
        await this.processMarkdownFiles(files, postsPath, status);
    }

    /**
     * Process markdown files found in the _posts directory
     * @param files List of filenames
     * @param postsPath Path to the _posts directory
     * @param status Current git status
     */
    private async processMarkdownFiles(files: string[], postsPath: string, status: StatusResult): Promise<void> {
        for (const file of files) {
            if (!file.endsWith('.md')) continue;
            
            const filePath = path.join(postsPath, file);
            try {
                await this.processMarkdownFile(file, filePath, status);
            } catch (fileError) {
                this.errorService.logWarning(
                    `Error processing file: ${fileError instanceof Error ? fileError.message : fileError}`,
                    `File: ${file}`
                );
                // Continue with next file
            }
        }
    }

    /**
     * Process a single markdown file and update its status if needed
     * @param filename Filename
     * @param filePath Full path to the file
     * @param status Current git status
     */
    private async processMarkdownFile(filename: string, filePath: string, status: StatusResult): Promise<void> {
        // Ensure file has date in front matter
        await this.fileService.ensurePostHasDate(filePath);
        
        // Check if file is untracked
        const relativePath = `source/_posts/${filename}`;
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

    /**
     * Check if there are changes in the _posts directory
     * @param status Git status
     * @returns Boolean indicating if there are changes in _posts
     */
    private hasChangesInPosts(status: StatusResult): boolean {
        return status.files.some(file => /_posts/.test(file.path)) || 
               status.not_added.some(file => /_posts/.test(file));
    }

    /**
     * Commit changes with an appropriate message
     * @param status Git status containing the changes to commit
     */
    @handleError('Git Service', ErrorSeverity.ERROR, GitOperationError)
    public async commitChanges(status: StatusResult): Promise<void> {
        const timestamp = new Date().toISOString();
        const commitMessage = this.buildCommitMessage(status, timestamp);

        await this.git.add('.');  // Stage all changes
        await this.git.commit(commitMessage);
        
        this.errorService.logInfo(
            `Successfully committed changes: ${commitMessage}`, 
            'Git Commit'
        );
    }

    /**
     * Build a descriptive commit message
     * @param status Git status
     * @param timestamp ISO timestamp
     * @returns Formatted commit message
     */
    private buildCommitMessage(status: StatusResult, timestamp: string): string {
        const addedFiles = status.created.map(file => `A: ${file}`).join(', ');
        const modifiedFiles = status.modified.map(file => `M: ${file}`).join(', ');
        const deletedFiles = status.deleted.map(file => `D: ${file}`).join(', ');
        const untrackedFiles = status.not_added.map(file => `U: ${file}`).join(', ');

        return `Changes at ${timestamp} - ${addedFiles} ${modifiedFiles} ${deletedFiles} ${untrackedFiles}`.trim();
    }

    /**
     * Push committed changes to the remote repository
     */
    @handleError('Git Service', ErrorSeverity.ERROR, GitOperationError)
    public async pushChanges(): Promise<void> {
        await this.git.push();
        this.errorService.logInfo(
            'Successfully pushed changes to remote repository', 
            'Git Push'
        );
    }
} 
