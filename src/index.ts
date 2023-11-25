import {Notice, Plugin} from "obsidian";
import {HexoIntegrationSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";
import HexoIntegrationSettingsTab from "./settings/hexoIntegrationSettingsTab";
import {GitHandler} from "./git";
import {SymlinkHandler} from "./symlink";
import SettingsManager from "./SettingManager";

export default class HexoIntegrationPlugin extends Plugin {
	settingsManager: SettingsManager;

	settings: HexoIntegrationSettings;
	symlinkHandler: SymlinkHandler;
	gitHandler: GitHandler;

	async onload() {
		this.settingsManager = new SettingsManager(this);
		this.symlinkHandler = new SymlinkHandler(this.app);
		this.gitHandler = new GitHandler(this.settings.hexoSourcePath);

		await this.loadSettings();

		this.symlinkHandler = new SymlinkHandler(this.app);
		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
		const hexoBlogPath = this.settings.hexoSourcePath;

		this.gitHandler = new GitHandler(hexoBlogPath);

		// Add the following line to validate the symlink when the plugin loads
		const symlinkHandler = new SymlinkHandler(this.app); // Using the new SymlinkOperator

		await symlinkHandler.validateSymlink(hexoBlogPath);

		if (!this.settings.hexoSourcePath) {
			new Notice('Please configure the path to your Hexo blog in the settings.');
			return;
		}

		await symlinkHandler.createSystemSpecificSymlink(hexoBlogPath).catch(it => {
			throw new Error(`Failed to create symlink: ${it.message}`);
		})


		// Get the Hexo blog path from the plugin settings
		// Initialize the SimpleGit instance with the Hexo blog path
		// Call the `checkForChanges` function every minute (or any desired interval)
		this.setAutoSync();
	}

	private setAutoSync() {
		setInterval(async () => {
			await this.handleAutoSync();
		}, 60 * 1000);
	}

	private async handleAutoSync() {
		const status = await this.gitHandler.checkForChanges();
		if (status != null) {
			const changedFilesCount = status.created.length + status.modified.length + status.deleted.length;

			if (changedFilesCount > 0) {
				console.log('Changed files:', status.files);

				// Commit and push the changes
				try {
					await this.gitHandler.commitChanges(status);
					await this.gitHandler.pushChanges();
					console.log('Changes committed and pushed successfully.');
					new Notice('Changes committed and pushed successfully.');

				} catch (error) {
					console.error('Error during commit and push:', error);
					throw new Error(`Error during commit and push:${error.message}`);
				}
			}
		}
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
}
