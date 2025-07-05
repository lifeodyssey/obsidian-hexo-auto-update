import { App, FileSystemAdapter, Notice } from "obsidian";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Modern, permission-safe symlink service
 * Addresses Issues #1 and #3 - Mac permission problems
 */
export class SymlinkServiceV2 {
    private app: App;
    
    constructor(app: App) {
        this.app = app;
    }

    /**
     * Create symlink with comprehensive permission handling
     * @param hexoSourcePath Path to the Hexo blog source
     * @returns Promise<{success: boolean, message: string, fallback?: boolean}>
     */
    async createSafeSymlink(hexoSourcePath: string): Promise<{
        success: boolean;
        message: string;
        fallback?: boolean;
    }> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            if (!vaultPath) {
                return {
                    success: false,
                    message: 'Cannot access vault path - check Obsidian permissions'
                };
            }
            const targetFolder = this.getTargetFolderName();
            const symlinkPath = path.join(vaultPath, targetFolder);

            // Step 1: Check if we have necessary permissions
            const permissionCheck = await this.checkPermissions(vaultPath, hexoSourcePath);
            if (!permissionCheck.hasPermission) {
                return await this.handlePermissionDenied(hexoSourcePath, symlinkPath, permissionCheck.reason || 'Unknown permission error');
            }

            // Step 2: Clean up existing symlink if invalid
            await this.cleanupExistingSymlink(symlinkPath, hexoSourcePath);

            // Step 3: Create new symlink
            const result = await this.createSymlinkSafely(hexoSourcePath, symlinkPath);
            
            if (result.success) {
                new Notice(`✅ Blog link created successfully at ${targetFolder}`);
                return { success: true, message: 'Symlink created successfully' };
            } else {
                return await this.createFallbackReference(hexoSourcePath, symlinkPath);
            }

        } catch (error) {
            console.error('Symlink creation error:', error);
            return {
                success: false,
                message: `Failed to create blog link: ${error.message}`
            };
        }
    }

    /**
     * Check if we have necessary permissions for symlink creation
     */
    private async checkPermissions(vaultPath: string, hexoSourcePath: string): Promise<{
        hasPermission: boolean;
        reason?: string;
    }> {
        try {
            // Check if source path exists and is readable
            await fs.access(hexoSourcePath, fs.constants.R_OK);
            
            // Check if we can write to vault directory
            await fs.access(vaultPath, fs.constants.W_OK);
            
            // Test permission by creating a temporary file
            const testFile = path.join(vaultPath, `.permission-test-${Date.now()}`);
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            
            return { hasPermission: true };
            
        } catch (error) {
            let reason = 'Unknown permission error';
            
            if (error.code === 'ENOENT') {
                reason = 'Source path does not exist';
            } else if (error.code === 'EACCES') {
                reason = 'Permission denied - please grant file access';
            } else if (error.code === 'EPERM') {
                reason = 'Operation not permitted';
            }
            
            return { hasPermission: false, reason };
        }
    }

    /**
     * Handle permission denied scenario with user guidance
     */
    private async handlePermissionDenied(
        hexoSourcePath: string, 
        symlinkPath: string, 
        reason: string
    ): Promise<{success: boolean, message: string, fallback?: boolean}> {
        
        // Show user-friendly guidance
        new Notice(
            `⚠️ Permission Required\n\n` +
            `Reason: ${reason}\n\n` +
            `To fix this:\n` +
            `1. Go to System Preferences > Security & Privacy\n` +
            `2. Grant Obsidian "Full Disk Access" or access to your blog folder\n` +
            `3. Restart Obsidian and try again\n\n` +
            `Creating fallback reference instead...`,
            15000
        );

        // Create fallback reference
        return await this.createFallbackReference(hexoSourcePath, symlinkPath);
    }

    /**
     * Clean up existing symlink if it's invalid
     */
    private async cleanupExistingSymlink(symlinkPath: string, expectedTarget: string): Promise<void> {
        try {
            const stats = await fs.lstat(symlinkPath);
            
            if (stats.isSymbolicLink()) {
                const currentTarget = await fs.readlink(symlinkPath);
                
                // Remove if pointing to wrong location
                if (path.normalize(currentTarget) !== path.normalize(expectedTarget)) {
                    await fs.unlink(symlinkPath);
                    console.log('Removed invalid symlink:', currentTarget);
                }
            } else if (stats.isDirectory()) {
                // Check if it's our fallback directory
                const configFile = path.join(symlinkPath, '.hexo-config.json');
                try {
                    const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
                    if (config.linkType === 'reference') {
                        // This is our fallback, remove it to create proper symlink
                        await fs.rm(symlinkPath, { recursive: true });
                    }
                } catch {
                    // Not our fallback directory, leave it alone
                }
            }
        } catch (error) {
            // File doesn't exist or other error, continue
            console.debug('Cleanup error (non-critical):', error.message);
        }
    }

    /**
     * Create symlink with proper error handling
     */
    private async createSymlinkSafely(source: string, target: string): Promise<{success: boolean, error?: string}> {
        try {
            await fs.symlink(source, target, 'dir');
            console.log('Symlink created successfully:', target);
            return { success: true };
        } catch (error) {
            console.error('Symlink creation failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create fallback reference when symlink is not possible
     */
    private async createFallbackReference(
        hexoSourcePath: string, 
        symlinkPath: string
    ): Promise<{success: boolean, message: string, fallback: boolean}> {
        try {
            // Create reference directory
            await fs.mkdir(symlinkPath, { recursive: true });
            
            // Create configuration file
            const config = {
                blogPath: hexoSourcePath,
                linkType: 'reference',
                created: new Date().toISOString(),
                platform: os.platform(),
                reason: 'Symlink not available due to permissions'
            };
            
            const configFile = path.join(symlinkPath, '.hexo-config.json');
            await fs.writeFile(configFile, JSON.stringify(config, null, 2));
            
            // Create readme file for users
            const readmeContent = [
                '# Blog Reference',
                '',
                'This folder is a reference to your Hexo blog, not a direct symlink.',
                '',
                `**Blog Path:** ${hexoSourcePath}`,
                `**Created:** ${new Date().toLocaleString()}`,
                '',
                '## Why not a symlink?',
                'Obsidian does not have the necessary permissions to create a symlink.',
                'The plugin will still work, but with some limitations.',
                '',
                '## To enable full functionality:',
                '1. Grant Obsidian "Full Disk Access" in System Preferences',
                '2. Restart Obsidian',
                '3. Recreate the blog link'
            ].join('\n');
            
            const readmeFile = path.join(symlinkPath, 'README.md');
            await fs.writeFile(readmeFile, readmeContent);
            
            new Notice(
                `📁 Created blog reference folder\n\n` +
                `The plugin will work with reduced functionality.\n` +
                `Check the README.md in the folder for more info.`,
                8000
            );
            
            return {
                success: true,
                message: 'Fallback reference created successfully',
                fallback: true
            };
            
        } catch (error) {
            console.error('Fallback creation failed:', error);
            return {
                success: false,
                message: `Failed to create fallback reference: ${error.message}`,
                fallback: true
            };
        }
    }

    /**
     * Get platform-specific target folder name
     */
    private getTargetFolderName(): string {
        const platform = os.platform();
        switch (platform) {
            case 'darwin': return 'Mac Blog';
            case 'win32': return 'Win Blog';
            default: return 'Hexo Blog';
        }
    }

    /**
     * Validate existing symlink or reference
     */
    async validateSymlink(hexoSourcePath: string): Promise<{
        isValid: boolean;
        type: 'symlink' | 'reference' | 'missing';
        needsRecreation: boolean;
    }> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            if (!vaultPath) {
                return {
                    isValid: false,
                    type: 'missing',
                    needsRecreation: true
                };
            }
            const targetFolder = this.getTargetFolderName();
            const symlinkPath = path.join(vaultPath, targetFolder);
            
            const stats = await fs.lstat(symlinkPath);
            
            if (stats.isSymbolicLink()) {
                const currentTarget = await fs.readlink(symlinkPath);
                const isValid = path.normalize(currentTarget) === path.normalize(hexoSourcePath);
                
                return {
                    isValid,
                    type: 'symlink',
                    needsRecreation: !isValid
                };
            } else if (stats.isDirectory()) {
                const configFile = path.join(symlinkPath, '.hexo-config.json');
                try {
                    const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
                    const isValid = path.normalize(config.blogPath) === path.normalize(hexoSourcePath);
                    
                    return {
                        isValid,
                        type: 'reference',
                        needsRecreation: !isValid
                    };
                } catch {
                    return {
                        isValid: false,
                        type: 'reference',
                        needsRecreation: true
                    };
                }
            }
            
        } catch (error) {
            // Path doesn't exist
            if (error.code === 'ENOENT') {
                return {
                    isValid: false,
                    type: 'missing',
                    needsRecreation: true
                };
            }
            throw error;
        }
        
        return {
            isValid: false,
            type: 'missing',
            needsRecreation: true
        };
    }

    /**
     * Get the actual blog path from symlink or reference
     */
    async getBlogPath(): Promise<string | null> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            if (!vaultPath) {
                console.debug('Cannot access vault path for getBlogPath');
                return null;
            }
            const targetFolder = this.getTargetFolderName();
            const symlinkPath = path.join(vaultPath, targetFolder);
            
            const stats = await fs.lstat(symlinkPath);
            
            if (stats.isSymbolicLink()) {
                return await fs.readlink(symlinkPath);
            } else if (stats.isDirectory()) {
                const configFile = path.join(symlinkPath, '.hexo-config.json');
                const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
                return config.blogPath;
            }
            
        } catch (error) {
            console.debug('Could not get blog path:', error.message);
        }
        
        return null;
    }
}