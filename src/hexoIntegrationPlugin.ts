import { App, FileSystemAdapter, Plugin } from "obsidian";
import { HexoIntegrationSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import HexoIntegrationSettingsTab from "./hexoIntegrationSettingsTab";
import { createHexoSymlink ,checkForChanges} from "./hexoIntegrationHelper";
import { simpleGit, SimpleGit } from 'simple-git';

export default class HexoIntegrationPlugin extends Plugin {
	settings: HexoIntegrationSettings;
	git: SimpleGit;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
		// Get the Hexo blog path from the plugin settings
		const hexoBlogPath = this.settings.hexoSourcePath;

		// Initialize the SimpleGit instance with the Hexo blog path
		this.git = simpleGit(hexoBlogPath);
		// Call the `checkForChanges` function every minute (or any desired interval)
		setInterval(async () => {
			const changedFiles = await checkForChanges(this.git);
			if (changedFiles.length > 0) {
				console.log('Changed files:', changedFiles);

				// TODO: Implement commit and push actions here
			}
		}, 60 * 1000);
	}

	onunload() {}

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
			const result = await createHexoSymlink(
				this.app,
				this.settings.hexoSourcePath
			);

			return result;
		} catch (error) {
			throw new Error(`Failed to create symlink: ${error.message}`);
		}
	}
}
