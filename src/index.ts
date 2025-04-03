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
	private autoSyncIntervalId: NodeJS.Timeout | null = null;

	async onload() {
		this.settingsManager = new SettingsManager(this);
		await this.loadSettings();

		this.symlinkHandler = new SymlinkHandler(this.app);
		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
		
		// Initialize GitHandler only if hexoSourcePath is defined
		if (this.settings.hexoSourcePath) {
			const hexoBlogPath = this.settings.hexoSourcePath;
			this.gitHandler = new GitHandler(hexoBlogPath);

			// Validate symlink
			try {
				await this.symlinkHandler.validateSymlink(hexoBlogPath);
			} catch (error) {
				console.error("Error validating symlink:", error);
				new Notice('Error validating symlink to Hexo blog. Please check settings.');
			}

			// Start auto-sync
			this.setAutoSync();
		} else {
			new Notice('Please configure the path to your Hexo blog in the settings.');
		}
	}

	private setAutoSync() {
		// Clear any existing interval to prevent memory leaks
		if (this.autoSyncIntervalId) {
			clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}

		// Set up new interval
		this.autoSyncIntervalId = setInterval(async () => {
			await this.handleAutoSync();
		}, 60 * 1000); // Check every minute
		
		console.log('Auto-sync interval set up');
	}

	private async handleAutoSync() {
		try {
			if (!this.gitHandler) {
				console.log('GitHandler not initialized, skipping auto-sync');
				return;
			}
			
			const status = await this.gitHandler.checkForChanges();
			if (status != null) {
				const changedFilesCount = status.created.length + status.modified.length + status.deleted.length + status.not_added.length;

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
						new Notice(`Error during commit and push: ${error.message}`);
					}
				}
			}
		} catch (error) {
			console.error('Error in auto-sync:', error);
			new Notice(`Error in auto-sync: ${error.message}`);
		}
	}

	onunload() {
		// Clean up the interval when the plugin is disabled
		if (this.autoSyncIntervalId) {
			clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}
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
		
		// Reinitialize GitHandler with new path if settings changed
		if (this.settings.hexoSourcePath) {
			this.gitHandler = new GitHandler(this.settings.hexoSourcePath);
			
			// Restart auto-sync after settings changed
			this.setAutoSync();
		}
	}
}
