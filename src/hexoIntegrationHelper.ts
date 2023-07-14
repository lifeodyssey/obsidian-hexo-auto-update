import {App, FileSystemAdapter} from 'obsidian';
import {SimpleGit, StatusResult} from 'simple-git';

const symlinkDir = require('symlink-dir');
const path = require('path');


export async function createHexoSymlink(app: App, hexoSourcePath: string): Promise<string> {
	try {
		const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();

		const result = await symlinkDir(hexoSourcePath, vaultPath);

		if (result.reused) {
			console.log('Symlink already exists and has been reused:', vaultPath);
		} else {
			console.log('Symlink successfully created:', vaultPath);
		}

		return 'success';
	} catch (error) {
		console.error('Failed to create symlink:', error);
		return 'failure';
	}
}

export async function checkForChanges(git: SimpleGit): Promise<StatusResult> {
	const status = await git.status();
	return status;
	
}

export async function commitChanges(git: SimpleGit, status: StatusResult): Promise<void> {
	const timestamp = new Date().toISOString();

	// Categorize files based on their status
	const addedFiles = status.created.map(file => `A: ${file}`).join(', ');
	const modifiedFiles = status.modified.map(file => `M: ${file}`).join(', ');
	const deletedFiles = status.deleted.map(file => `D: ${file}`).join(', ');

	// Construct the commit message
	const commitMessage = `Changes at ${timestamp} - ${addedFiles} ${modifiedFiles} ${deletedFiles}`.trim();

	await git.add('.'); // Stage all changes
	await git.commit(commitMessage);
}

export async function pushChanges(git: SimpleGit): Promise<void> {
	await git.push();
}
