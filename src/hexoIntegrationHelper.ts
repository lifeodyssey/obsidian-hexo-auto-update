import { App, FileSystemAdapter } from 'obsidian';
const symlinkDir = require('symlink-dir');
const path = require('path');

export async function createHexoSymlink(app: App, hexoSourcePath: string): Promise<string> {
	try {
		const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();
		const hexoFolderName = hexoSourcePath.split('/').pop();
		const newFolderPath = path.join(vaultPath, hexoFolderName);

		const result = await symlinkDir(hexoSourcePath, newFolderPath);

		if (result.reused) {
			console.log('Symlink already exists and has been reused:', newFolderPath);
		} else {
			console.log('Symlink successfully created:', newFolderPath);
		}

		return 'success';
	} catch (error) {
		console.error('Failed to create symlink:', error);
		return 'failure';
	}
}
