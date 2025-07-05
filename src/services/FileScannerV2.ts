import { glob } from 'fast-glob';
import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';

/**
 * Direct filesystem scanner using fast-glob
 * Addresses Issue #2 - Only detecting git-committed changes
 */

export interface ScanResult {
    allFiles: string[];
    newFiles: string[];           // Files not in git at all
    modifiedFiles: string[];      // Files changed since last commit
    untrackedFiles: string[];     // Files git knows but not committed
    gitFiles: {
        staged: string[];
        unstaged: string[];
        untracked: string[];
    };
}

export interface ScanOptions {
    includePatterns?: string[];
    excludePatterns?: string[];
    followSymlinks?: boolean;
    ignoreCase?: boolean;
    onlyFiles?: boolean;
    markDirectories?: boolean;
    gitAware?: boolean;
}

export class FileScannerV2 {
    private hexoPath: string;
    private git: any;

    constructor(hexoPath: string) {
        this.hexoPath = hexoPath;
        this.git = simpleGit(hexoPath);
    }

    /**
     * Comprehensive scan that finds ALL files, not just git-tracked ones
     * @param scanPath Path to scan (relative to hexo path)
     * @param options Scan options
     * @returns Complete scan result
     */
    async comprehensiveScan(
        scanPath: string = 'source/_posts',
        options: ScanOptions = {}
    ): Promise<ScanResult> {
        const fullScanPath = path.join(this.hexoPath, scanPath);
        
        try {
            // Step 1: Get all files from filesystem
            const allFiles = await this.scanFilesystem(fullScanPath, options);
            
            // Step 2: Get git status
            let gitFiles: { staged: string[]; unstaged: string[]; untracked: string[] } = { 
                staged: [], 
                unstaged: [], 
                untracked: [] 
            };
            if (options.gitAware !== false) {
                gitFiles = await this.getGitStatus(scanPath);
            }
            
            // Step 3: Determine what's truly new vs modified
            const { newFiles, modifiedFiles, untrackedFiles } = await this.categorizeFiles(
                allFiles, 
                gitFiles, 
                scanPath
            );
            
            return {
                allFiles,
                newFiles,
                modifiedFiles,
                untrackedFiles,
                gitFiles
            };
            
        } catch (error) {
            console.error('Comprehensive scan failed:', error);
            throw error;
        }
    }

    /**
     * Scan filesystem directly using fast-glob
     * @param scanPath Path to scan
     * @param options Scan options
     * @returns Array of file paths
     */
    private async scanFilesystem(scanPath: string, options: ScanOptions): Promise<string[]> {
        const defaultPatterns = [
            '**/*.md',
            '**/*.markdown'
        ];
        
        const patterns = options.includePatterns || defaultPatterns;
        
        const globOptions = {
            cwd: scanPath,
            dot: false, // Don't include hidden files
            followSymbolicLinks: options.followSymlinks ?? false,
            caseSensitiveMatch: !options.ignoreCase,
            onlyFiles: options.onlyFiles ?? true,
            markDirectories: options.markDirectories ?? false,
            ignore: options.excludePatterns || [
                '**/node_modules/**',
                '**/.git/**',
                '**/.DS_Store',
                '**/Thumbs.db',
                '**/*.tmp',
                '**/*.swp',
                '**/*.bak'
            ],
            absolute: false,
            stats: false
        };

        try {
            const files = await glob(patterns, globOptions);
            
            // Convert to absolute paths
            const absoluteFiles = files.map(file => path.resolve(scanPath, file));
            
            console.log(`Found ${files.length} files in filesystem scan`);
            return absoluteFiles;
            
        } catch (error) {
            console.error('Filesystem scan failed:', error);
            return [];
        }
    }

    /**
     * Get git status for comparison
     * @param relativePath Relative path within git repo
     * @returns Git status information
     */
    private async getGitStatus(relativePath: string): Promise<{
        staged: string[];
        unstaged: string[];
        untracked: string[];
    }> {
        try {
            const status = await this.git.status();
            
            // Filter files to only include those in our scan path
            const filterByPath = (files: string[]) => {
                return files
                    .filter(file => file.startsWith(relativePath))
                    .map(file => path.resolve(this.hexoPath, file));
            };
            
            return {
                staged: filterByPath(status.staged),
                unstaged: filterByPath([...status.modified, ...status.deleted]),
                untracked: filterByPath(status.not_added)
            };
            
        } catch (error) {
            console.error('Git status check failed:', error);
            return { staged: [], unstaged: [], untracked: [] };
        }
    }

    /**
     * Categorize files into new, modified, and untracked
     * @param allFiles All files found in filesystem
     * @param gitFiles Git status information
     * @param scanPath Relative scan path
     * @returns Categorized file lists
     */
    private async categorizeFiles(
        allFiles: string[],
        gitFiles: { staged: string[]; unstaged: string[]; untracked: string[] },
        _scanPath: string
    ): Promise<{
        newFiles: string[];
        modifiedFiles: string[];
        untrackedFiles: string[];
    }> {
        const gitKnownFiles = new Set([
            ...gitFiles.staged,
            ...gitFiles.unstaged,
            ...gitFiles.untracked
        ]);

        // Check which files git has never seen
        const newFiles: string[] = [];
        const modifiedFiles: string[] = [];
        
        for (const file of allFiles) {
            if (!gitKnownFiles.has(file)) {
                // This is a truly new file that git doesn't know about
                newFiles.push(file);
            } else if (gitFiles.unstaged.includes(file)) {
                // This is a modified file
                modifiedFiles.push(file);
            }
        }
        
        return {
            newFiles,
            modifiedFiles,
            untrackedFiles: gitFiles.untracked
        };
    }

    /**
     * Get file metadata for a list of files
     * @param filePaths Array of file paths
     * @returns Array of file metadata
     */
    async getFileMetadata(filePaths: string[]): Promise<Array<{
        path: string;
        size: number;
        mtime: Date;
        ctime: Date;
        isNew: boolean;
        hasValidFrontMatter: boolean;
    }>> {
        const metadata = [];
        
        for (const filePath of filePaths) {
            try {
                const stats = await fs.stat(filePath);
                
                // Check if file has front matter
                const content = await fs.readFile(filePath, 'utf8');
                const hasValidFrontMatter = this.hasValidFrontMatter(content);
                
                // Consider file "new" if created recently (within last 5 minutes)
                const isNew = (Date.now() - stats.ctime.getTime()) < (5 * 60 * 1000);
                
                metadata.push({
                    path: filePath,
                    size: stats.size,
                    mtime: stats.mtime,
                    ctime: stats.ctime,
                    isNew,
                    hasValidFrontMatter
                });
                
            } catch (error) {
                console.error(`Failed to get metadata for ${filePath}:`, error);
            }
        }
        
        return metadata;
    }

    /**
     * Quick check if file has valid front matter
     * @param content File content
     * @returns True if has valid front matter
     */
    private hasValidFrontMatter(content: string): boolean {
        return content.startsWith('---\n') && content.includes('\n---\n');
    }

    /**
     * Find files that need attention (missing front matter, no date, etc.)
     * @param scanPath Path to scan
     * @returns Files that need processing
     */
    async findFilesNeedingAttention(scanPath: string = 'source/_posts'): Promise<{
        missingFrontMatter: string[];
        missingDate: string[];
        missingTitle: string[];
        recentlyCreated: string[];
    }> {
        const result = await this.comprehensiveScan(scanPath);
        const metadata = await this.getFileMetadata(result.allFiles);
        
        const missingFrontMatter: string[] = [];
        const missingDate: string[] = [];
        const missingTitle: string[] = [];
        const recentlyCreated: string[] = [];
        
        for (const file of metadata) {
            if (!file.hasValidFrontMatter) {
                missingFrontMatter.push(file.path);
            }
            
            if (file.isNew) {
                recentlyCreated.push(file.path);
            }
            
            // TODO: More detailed front matter analysis would go here
            // This would require the gray-matter integration we'll implement next
        }
        
        return {
            missingFrontMatter,
            missingDate,
            missingTitle,
            recentlyCreated
        };
    }

    /**
     * Get incremental changes since last scan
     * @param lastScanTime Timestamp of last scan
     * @param scanPath Path to scan
     * @returns Files changed since last scan
     */
    async getIncrementalChanges(
        lastScanTime: Date,
        scanPath: string = 'source/_posts'
    ): Promise<{
        addedFiles: string[];
        modifiedFiles: string[];
        deletedFiles: string[];
    }> {
        try {
            const result = await this.comprehensiveScan(scanPath);
            const metadata = await this.getFileMetadata(result.allFiles);
            
            const addedFiles = metadata
                .filter(file => file.ctime > lastScanTime)
                .map(file => file.path);
                
            const modifiedFiles = metadata
                .filter(file => file.mtime > lastScanTime && file.ctime <= lastScanTime)
                .map(file => file.path);
            
            // Note: Detecting deleted files requires maintaining a previous state
            // This could be enhanced with a cache/database
            const deletedFiles: string[] = [];
            
            return {
                addedFiles,
                modifiedFiles,
                deletedFiles
            };
            
        } catch (error) {
            console.error('Incremental scan failed:', error);
            return { addedFiles: [], modifiedFiles: [], deletedFiles: [] };
        }
    }

    /**
     * Validate that the scan path exists and is accessible
     * @param scanPath Path to validate
     * @returns True if path is valid and accessible
     */
    async validateScanPath(scanPath?: string): Promise<boolean> {
        const fullPath = scanPath ? path.join(this.hexoPath, scanPath) : this.hexoPath;
        
        try {
            const stats = await fs.stat(fullPath);
            return stats.isDirectory();
        } catch (error) {
            console.error(`Scan path validation failed for ${fullPath}:`, error);
            return false;
        }
    }
}

/**
 * Utility function to create a scanner for Hexo posts
 */
export function createHexoPostsScanner(hexoPath: string): FileScannerV2 {
    return new FileScannerV2(hexoPath);
}

/**
 * Utility function to create a scanner with markdown-only patterns
 */
export function createMarkdownScanner(
    hexoPath: string,
    _customPatterns?: string[]
): FileScannerV2 {
    const scanner = new FileScannerV2(hexoPath);
    return scanner;
}