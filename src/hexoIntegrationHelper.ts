import {App, FileSystemAdapter} from 'obsidian';
import {SimpleGit, StatusResult} from 'simple-git';
import * as os from 'os';
import * as fs from 'fs';
import {exec} from 'child_process';


const symlinkDir = require('symlink-dir');
const path = require('path');

export async function createSystemSpecificSymlink(app: App, hexoSourcePath: string): Promise<string> {
	const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();
	const isWindows = os.platform() === 'win32';
	const targetFolder = isWindows ? 'Win Blog' : 'Mac Blog';
	const newFolderPath = path.join(vaultPath, targetFolder);
	console.log("Debug: hexoSourcePath:", hexoSourcePath);
	console.log("Debug: newFolderPath:", newFolderPath);

	if (!isSourcePathValid(hexoSourcePath)) {
		return 'The source directory does not exist';
	}

	if (isTargetPathInvalid(newFolderPath)) {
		return 'The target directory already exists and is not a symbolic link';
	}

	if (isWindows) {
		return await createJunctionForWindows(hexoSourcePath, newFolderPath);
	} else {
		return createSymlinkForMac(newFolderPath);
	}
}

function isSourcePathValid(sourcePath: string): boolean {
	if (fs.existsSync(sourcePath)) {
		console.log('Source exists:', sourcePath);
		return true;
	} else {
		console.log('Source does not exist:', sourcePath);
		return false;
	}
}

function isTargetPathInvalid(targetPath: string): boolean {
	if (fs.existsSync(targetPath)) {
		if (fs.lstatSync(targetPath).isSymbolicLink()) {
			console.log('Target exists and is a symbolic link:', targetPath);
			return false;
		} else {
			console.log('Target exists but is not a symbolic link:', targetPath);
			return true;
		}
	} else {
		console.log('Target does not exist:', targetPath);
		return false;
	}
}

async function createJunctionForWindows(hexoSourcePath: string, newFolderPath: string): Promise<string> {
	const powershellPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
	return new Promise((resolve, reject) => {
		exec(`${powershellPath} New-Item -ItemType Junction -Path "${newFolderPath}" -Target "${hexoSourcePath}"`, (error, stdout, stderr) => {
			if (error) {
				console.error('Failed to create junction:', error.message);
				console.error('Error Output:', stderr);
				reject(error.message);
			} else {
				console.log('Junction successfully created:', stdout);
				resolve('success');
			}
		});
	});
}


async function createSymlinkForMac(newFolderPath: string): Promise<string> {
	// Existing macOS behavior
	const sourceFolderPath = getBlogPathBasedOnPlatform(false, newFolderPath);
	if (!fs.existsSync(newFolderPath) || !fs.lstatSync(newFolderPath).isSymbolicLink()) {
		await symlinkDir(sourceFolderPath, newFolderPath);
		console.log('Symlink successfully created:', newFolderPath);
		return 'success';
	} else {
		console.log('Symlink already exists and is valid:', newFolderPath);
		return 'Symlink already exists';
	}
}


async function isSymlinked(hexoSourcePath: string, newFolderPath: string): Promise<boolean> {
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

export async function validateSymlink(app: App, hexoSourcePath: string): Promise<void> {
	const vaultPath = (app.vault.adapter as FileSystemAdapter).getBasePath();
	const isWindows = os.platform() === 'win32';
	const targetFolder = isWindows ? 'Win Blog' : 'Mac Blog';
	const newFolderPath = path.join(vaultPath, targetFolder);

	if (!(await isSymlinked(hexoSourcePath, newFolderPath))) {
		console.log('Symlink validation failed, attempting to create symlink...');
		await createSystemSpecificSymlink(app, hexoSourcePath);
	} else {
		console.log('Symlink validation succeeded, no action needed.');
	}
}

export async function checkForChanges(git: SimpleGit): Promise<StatusResult | null> {
	const status = await git.status();
	// check if any of the changes contain '_posts' in their directory path
	const changesInPosts = status.files.some(file => /_posts/.test(file.path));
	if (changesInPosts) {
		// if there are changes in the '_posts' directory, return the status
		return status;
	} else {
		// otherwise, return null
		return null
	}
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


function applyRelativePathToOS(relativePath: string, isWindows: boolean): string {
	if (isWindows) {
		return path.join('C:\\Users', os.userInfo().username, relativePath);
	} else {
		return path.join('/Users', os.userInfo().username, 'Library', 'CloudStorage', 'OneDrive-Personal', relativePath);
	}
}

function getBlogPathBasedOnPlatform(isWindows: boolean, vaultPath: string): string {
	const baseDir = vaultPath.split('OneDrive')[0] + (isWindows ? 'OneDrive\\Documents' : 'OneDrive-Personal/Documents');
	const blogFolderName = "Blog/source";
	return path.join(baseDir, blogFolderName);
}

