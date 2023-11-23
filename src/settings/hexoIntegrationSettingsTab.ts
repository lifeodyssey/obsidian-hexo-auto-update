import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import Index from "../index";
import {SymlinkHandler} from "../symlink";
import {HexoIntegrationSettings} from "../types";
require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {dialog} = require('electron').remote;


export default class HexoIntegrationSettingsTab extends PluginSettingTab {
    private settings: HexoIntegrationSettings;
    private symlinkHandler: SymlinkHandler;
    private plugin: Index;

    constructor(app: App,plugin:Index, settings: HexoIntegrationSettings, symlinkHandler: SymlinkHandler) {
        super(app,plugin);
        this.settings = settings;
        this.symlinkHandler = symlinkHandler;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl("h2", {
            text: "Settings for Hexo Integration Plugin.",
        });

        const hexoFolderSetting = new Setting(containerEl)
            .setName("Hexo Source Path")
            .setDesc("Specify the path to the Hexo source folder")
            .addButton(button => {
                button.setButtonText("Select Folder")
                    .onClick(async () => {
                        const result = await dialog.showOpenDialog({
                            properties: ['openDirectory']
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            const selectedPath = result.filePaths[0];
                            console.log("Selected Hexo Source Path: " + selectedPath);

                            this.plugin.settings.hexoSourcePath = selectedPath;
                            await this.plugin.saveSettings();
                            new Notice("Hexo source path set to: " + selectedPath);
                        }
                    });
            })
        const addButton = hexoFolderSetting.addButton((button) =>
            button
                .setButtonText("Add")
                .onClick(async () => {
                    if (this.plugin.settings.hexoSourcePath) {
                        addButton.setDisabled(true);

                        const addingNotice = new Notice("Adding...");

                        try {
                            const status = await this.symlinkHandler.createSystemSpecificSymlink(this.plugin.settings.hexoSourcePath);

                            addingNotice.hide();

                            new Notice(status);
                        } catch (error) {
                            new Notice(`Error: ${error.message}`);
                        } finally {
                            addButton.setDisabled(false);
                        }
                    } else {
                        new Notice(
                            "Please set the Hexo path in the plugin settings before creating the folder."
                        );
                    }
                })
        );
    }
}
