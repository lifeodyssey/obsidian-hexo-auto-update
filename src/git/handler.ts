import {simpleGit, SimpleGit, StatusResult} from 'simple-git';
import {IGitHandler} from "./interface";
import * as fs from 'fs';
import * as path from 'path';

export class GitHandler implements IGitHandler{
    private git: SimpleGit;
    private repoPath: string;

    constructor(repoPath:string) {
        this.git = simpleGit(repoPath);
        this.repoPath = repoPath;
    }

    public async checkForChanges(): Promise<StatusResult | null> {
        const status = await this.git.status();
        
        // Check for untracked files in _posts directory
        const postsPath = path.join(this.repoPath, 'source', '_posts');
        
        // Check if _posts directory exists
        if (fs.existsSync(postsPath)) {
            try {
                // Get all files in the _posts directory
                const files = fs.readdirSync(postsPath);
                
                // Process each file
                for (const file of files) {
                    if (file.endsWith('.md')) {
                        const filePath = path.join(postsPath, file);
                        
                        // Ensure file has date in front matter
                        await this.ensurePostHasDate(filePath);
                        
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

    private async ensurePostHasDate(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            
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
                    fs.writeFileSync(filePath, newContent, 'utf-8');
                    console.log(`Added date to post: ${path.basename(filePath)}`);
                }
            } else {
                // If no front matter exists, add one with a date
                const now = new Date();
                const dateStr = now.toISOString()
                    .replace('T', ' ')
                    .replace(/\.\d+Z$/, '');
                
                const newContent = `---\ndate: ${dateStr}\n---\n\n${content}`;
                fs.writeFileSync(filePath, newContent, 'utf-8');
                console.log(`Added front matter with date to post: ${path.basename(filePath)}`);
            }
        } catch (error) {
            console.error(`Error processing date in post ${filePath}:`, error);
        }
    }

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

    public async pushChanges(): Promise<void> {
        await this.git.push();
    }
}
