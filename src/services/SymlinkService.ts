import { App, FileSystemAdapter, Notice } from "obsidian";
import os from "os";
import path from "path";
import fs from "fs";
import symlinkDir from "symlink-dir";
import { SymlinkService } from "../core/interfaces/SymlinkService";
import { FileService } from "../core/interfaces/FileService";

/**
 * Implementation of SymlinkService that handles symlink operations
 */
export class SymlinkServiceImpl implements SymlinkService {
    private app: App;
    private fileService: FileService;

    /**
     * Constructor for SymlinkServiceImpl
     * @param app The Obsidian app instance
     * @param fileService Service for file operations
     */
    constructor(app: App, fileService: FileService) {
        this.app = app;
        this.fileService = fileService;
    }

    /**
     * Create a system-specific symlink to the Hexo blog
     * @param hexoSourcePath Path to the Hexo blog source
     * @returns Result status string
     */
    public async createSystemSpecificSymlink(hexoSourcePath: string): Promise<string> {
        try {
            const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
            const isWindows = os.platform() === 'win32';
            const isMacOS = os.platform() === 'darwin';
            const targetFolder = isWindows ? 'Win Blog' : 'Mac Blog';
            const newFolderPath = path.join(vaultPath, targetFolder);
            
            // Remove existing symlink if it's invalid
            if (this.fileService.exists(newFolderPath) && fs.lstatSync(newFolderPath).isSymbolicLink()) {
                try {
                    const currentTarget = fs.readlinkSync(newFolderPath);
                    if (currentTarget !== hexoSourcePath) {
                        fs.unlinkSync(newFolderPath);
                        console.log('Removed invalid symlink pointing to:', currentTarget);
                    }
                } catch (error) {
                    console.log('Error checking existing symlink:', error);
                }
            }

            if (!this.fileService.exists(newFolderPath) || !fs.lstatSync(newFolderPath).isSymbolicLink()) {
                if (isMacOS) {
                    // On macOS, show a notice before attempting to create symlink
                    new Notice(
                        'The plugin needs to create a symlink to your Hexo blog.\n' +
                        'If prompted, please grant Finder permissions to the requested folders.\n' +
                        'This is required for the plugin to function properly.'
                    );
                    
                    try {
                        // Try direct symlink first (may require permissions)
                        await symlinkDir(hexoSourcePath, newFolderPath);
                        console.log('Symlink successfully created:', newFolderPath);
                    } catch (error) {
                        console.error('Failed to create symlink with symlinkDir:', error);
                        
                        // Fallback to manually creating a directory with a .blogpath file inside
                        try {
                            if (!this.fileService.exists(newFolderPath)) {
                                fs.mkdirSync(newFolderPath, { recursive: true });
                            }
                            
                            // Create a .blogpath file with the path to the actual blog
                            const pathFile = path.join(newFolderPath, '.blogpath');
                            this.fileService.writeFile(pathFile, hexoSourcePath);
                            
                            new Notice(
                                'Created a reference folder instead of a symlink.\n' +
                                'The plugin will still work, but with reduced functionality.'
                            );
                            
                            return 'fallback';
                        } catch (fallbackError) {
                            console.error('Failed to create fallback reference:', fallbackError);
                            throw error; // Throw the original error
                        }
                    }
                } else if (isWindows) {
                    await symlinkDir(hexoSourcePath, newFolderPath);
                    console.log('Symlink successfully created:', newFolderPath);
                } else {
                    await symlinkDir(hexoSourcePath, newFolderPath);
                    console.log('Symlink successfully created:', newFolderPath);
                }
            } else {
                console.log('Symlink already exists and is valid:', newFolderPath);
            }

            return 'success';
        } catch (error) {
            console.error('Failed to create symlink:', error);
            new Notice(
                'Failed to create a link to your Hexo blog.\n' +
                'The plugin may not work properly.\n' +
                'Try restarting Obsidian with administrator privileges.'
            );
            return 'failure';
        }
    }

    /**
     * Check if a path is symlinked to the hexo source path
     * @param hexoSourcePath Path to the Hexo blog source
     * @param newFolderPath Path to the symlink folder
     * @returns True if path is properly symlinked, false otherwise
     */
    private async isSymlinked(hexoSourcePath: string, newFolderPath: string): Promise<boolean> {
        try {
            // First check if it's a proper symlink
            if (this.fileService.exists(newFolderPath)) {
                const stats = await fs.promises.lstat(newFolderPath);
                
                if (stats.isSymbolicLink()) {
                    const symlinkTarget = await fs.promises.readlink(newFolderPath);
                    // Normalize the paths before comparing them
                    return path.normalize(hexoSourcePath) === path.normalize(symlinkTarget);
                } else if (stats.isDirectory()) {
                    // Check for fallback reference file
                    const pathFile = path.join(newFolderPath, '.blogpath');
                    if (this.fileService.exists(pathFile)) {
                        const pathContent = this.fileService.readFile(pathFile).trim();
                        return path.normalize(hexoSourcePath) === path.normalize(pathContent);
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.error('Failed to check if path is a symlink:', error);
            return false;
        }
    }

    /**
     * Validate that the symlink to the Hexo blog exists and is correct
     * @param hexoSourcePath Path to the Hexo blog source
     */
    public async validateSymlink(hexoSourcePath: string): Promise<void> {
        if (!hexoSourcePath) {
            console.log('No Hexo source path configured, skipping symlink validation');
            return;
        }
        
        const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
        const isWindows = os.platform() === 'win32';
        const targetFolder = isWindows ? 'Win Blog' : 'Mac Blog';
        const newFolderPath = path.join(vaultPath, targetFolder);

        if (!(await this.isSymlinked(hexoSourcePath, newFolderPath))) {
            console.log('Symlink validation failed, attempting to create symlink...');
            await this.createSystemSpecificSymlink(hexoSourcePath);
        } else {
            console.log('Symlink validation succeeded, no action needed.');
        }
    }
} 
