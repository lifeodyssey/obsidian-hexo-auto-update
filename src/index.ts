import {Notice, Plugin} from "obsidian";
import {HexoIntegrationSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";
import HexoIntegrationSettingsTab from "./settings/hexoIntegrationSettingsTab";
import {simpleGit} from 'simple-git';
import {GitHandler} from "./git";
import {SymlinkHandler} from "./symlink";

export default class HexoIntegrationPlugin extends Plugin {
    settings: HexoIntegrationSettings;
    gitHandler: GitHandler;

    async onload() {

        await this.loadSettings();
        this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
        const hexoBlogPath = this.settings.hexoSourcePath;

        this.gitHandler = new GitHandler(simpleGit(hexoBlogPath));

        // Add the following line to validate the symlink when the plugin loads
        const symlinkHandler = new SymlinkHandler(this.app); // Using the new SymlinkOperator

        await symlinkHandler.validateSymlink(hexoBlogPath);

        if (!this.settings.hexoSourcePath) {
            new Notice('Please configure the path to your Hexo blog in the settings.');
            return;
        }

        await this.createSymlink();

        this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
        // Get the Hexo blog path from the plugin settings
        // Initialize the SimpleGit instance with the Hexo blog path
        // Call the `checkForChanges` function every minute (or any desired interval)
        setInterval(async () => {
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
            const symlinkHandler = new SymlinkHandler(this.app); // Using the new SymlinkOperator

            const status = await symlinkHandler.createSystemSpecificSymlink(this.settings.hexoSourcePath);


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
