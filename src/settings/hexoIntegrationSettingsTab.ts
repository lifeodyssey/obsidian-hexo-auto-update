import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import {SymlinkHandler} from "../symlink";
import {HexoIntegrationSettings} from "../types";
import HexoIntegrationPlugin from "../index";
import {dialog} from "electron";
import SettingsManager from "../SettingManager";
import settingManager from "../SettingManager";

// Add type for modern Electron dialog result
interface ElectronDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
}

export default class HexoIntegrationSettingsTab extends PluginSettingTab {
    private settings: HexoIntegrationSettings;
    private symlinkHandler: SymlinkHandler;
    private settingManager:SettingsManager

    constructor(app: App,plugin:HexoIntegrationPlugin) {
        super(app,plugin);
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
                        try {
                            const result = await dialog.showOpenDialog({
                                properties: ['openDirectory']
                            });
                            
                            let selectedPath: string | undefined;
                            
                            // Handle result based on type
                            if (Array.isArray(result)) {
                                // Old API returns string[]
                                selectedPath = result.length > 0 ? result[0] : undefined;
                            } else {
                                // New API returns {canceled, filePaths}
                                const modernResult = result as unknown as ElectronDialogReturnValue;
                                if (!modernResult.canceled && modernResult.filePaths?.length > 0) {
                                    selectedPath = modernResult.filePaths[0];
                                }
                            }
                            
                            if (selectedPath) {
                                console.log("Selected Hexo Source Path: " + selectedPath);
                                this.settings.hexoSourcePath = selectedPath;
                                await this.settingManager.saveSettings();
                                new Notice("Hexo source path set to: " + selectedPath);
                            }
                        } catch (error) {
                            console.error("Error selecting folder:", error);
                            new Notice("Error selecting folder: " + error.message);
                        }
                    });
            })
        const addButton = hexoFolderSetting.addButton((button) =>
            button
                .setButtonText("Add")
                .onClick(async () => {
                    if (this.settings.hexoSourcePath) {
                        addButton.setDisabled(true);

                        const addingNotice = new Notice("Adding...");

                        try {
                            const status = await this.symlinkHandler.createSystemSpecificSymlink(this.settings.hexoSourcePath);

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
