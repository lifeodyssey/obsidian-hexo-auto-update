import {Notice, Plugin,debounce, TFolder,TAbstractFile} from "obsidian";
import {HexoIntegrationSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";
import HexoIntegrationSettingsTab from "./hexoIntegrationSettingsTab";
import {checkForChanges, commitChanges, createSystemSpecificSymlink, pushChanges,validateSymlink} from "./hexoIntegrationHelper";
import {simpleGit, SimpleGit} from 'simple-git';

export default class HexoIntegrationPlugin extends Plugin {
	// TODO load file explorer when add symlink
	settings: HexoIntegrationSettings;
	git: SimpleGit;

	async onload() {

		await this.loadSettings();
		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
		const hexoBlogPath = this.settings.hexoSourcePath;

		this.git = simpleGit(hexoBlogPath);

		// Add the following line to validate the symlink when the plugin loads
		await validateSymlink(this.app, hexoBlogPath);

		if (!this.settings.hexoSourcePath) {
			new Notice('Please configure the path to your Hexo blog in the settings.');
			return;
		}

		await this.createSymlink();

		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
		// Get the Hexo blog path from the plugin settings
		// Initialize the SimpleGit instance with the Hexo blog path
		this.git = simpleGit(hexoBlogPath);
		// Call the `checkForChanges` function every minute (or any desired interval)
		setInterval(async () => {
			const status = await checkForChanges(this.git);
			if (status != null) {
				const changedFilesCount = status.created.length + status.modified.length + status.deleted.length;

				if (changedFilesCount > 0) {
					console.log('Changed files:', status.files);

					// Commit and push the changes
					try {
						await commitChanges(this.git, status);
						await pushChanges(this.git);
						console.log('Changes committed and pushed successfully.');
						new Notice('Changes committed and pushed successfully.');

					} catch (error) {
						console.error('Error during commit and push:', error);
						throw new Error(`Error during commit and push:${error.message}`);
					}
				}
			}
		}, 60 * 1000);
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async createSymlink() {
		try {
			const status = await createSystemSpecificSymlink(this.app, this.settings.hexoSourcePath);
			

			// if (status === 'success') {
			// 	// Refresh the Obsidian file explorer to show the newly created symlink
			// 	this.refreshFiles();
			// }

			return status;
		} catch (error) {
			throw new Error(`Failed to create symlink: ${error.message}`);
		}
	}
}
