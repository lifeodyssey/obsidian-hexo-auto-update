import {ISymlinkHandler} from "./interface";
import {App, FileSystemAdapter} from "obsidian";
import os from "os";
import path from "path";
import fs from "fs";
import symlinkDir from "symlink-dir";

export class SymlinkHandler implements ISymlinkHandler {

    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    public async createSystemSpecificSymlink(hexoSourcePath: string): Promise<string> {
        try {
            const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();
            const isWindows = os.platform() === 'win32';
            const targetFolder = isWindows ? 'Win Blog' : 'Mac Blog';
            const newFolderPath = path.join(vaultPath, targetFolder);

            if (!fs.existsSync(newFolderPath) || !fs.lstatSync(newFolderPath).isSymbolicLink()) {
                if (isWindows) {
                    await symlinkDir(hexoSourcePath, newFolderPath,);
                } else {
                    await symlinkDir(hexoSourcePath, newFolderPath);
                }

                console.log('Symlink successfully created:', newFolderPath);
            } else {
                console.log('Symlink already exists and is valid:', newFolderPath);
            }

            return 'success';
        } catch (error) {
            console.error('Failed to create symlink:', error);
            return 'failure';
        }
    }

    private async isSymlinked(hexoSourcePath: string, newFolderPath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.lstat(newFolderPath);

            if (stats.isSymbolicLink()) {
                const symlinkTarget = await fs.promises.readlink(newFolderPath);

                // Normalize the paths before comparing them, to account for possible differences in path formats
                return path.normalize(hexoSourcePath) === path.normalize(symlinkTarget);
            } else {
                return false;
            }
        } catch (error) {
            console.error('Failed to check if path is a symlink:', error);
            return false;
        }
    }

    public async validateSymlink(hexoSourcePath: string): Promise<void> {
        const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();
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

