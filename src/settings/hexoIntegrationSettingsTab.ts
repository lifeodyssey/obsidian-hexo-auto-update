import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import HexoIntegrationPlugin from "../index";
import {dialog} from "electron";

// Add type for modern Electron dialog result
interface ElectronDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
}

export default class HexoIntegrationSettingsTab extends PluginSettingTab {
    private plugin: HexoIntegrationPlugin;

    constructor(app: App, plugin: HexoIntegrationPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl("h2", {
            text: "Settings for Hexo Integration Plugin.",
        });

        new Setting(containerEl).setName('Content mode').setDesc('External mode keeps the existing safe-reference workflow. Vault mode edits one public folder natively, with the Hexo engine outside the vault.')
            .addDropdown(dropdown => dropdown.addOption('external', 'External Hexo repository').addOption('vault', 'Public content inside this vault')
                .setValue(this.plugin.settings.contentMode || 'external').onChange(async value => {
                    try { await this.plugin.changeContentMode(value as 'external' | 'vault'); this.display(); }
                    catch (error) { new Notice(`Mode change failed: ${error.message}`); }
                }));
        if (this.plugin.settings.contentMode === 'vault') {
            containerEl.createEl('p', {text: 'Experimental opt-in. Use a dedicated PUBLIC folder inside this vault, with an existing Git repository rooted at that folder. No migration or repository creation is performed. Initial automatic sync/commit/push are off. Only _posts is managed; other assets/pages require manual Git review.'});
            new Setting(containerEl).setName('Public content folder (absolute)').addText(text => text.setValue(this.plugin.settings.vaultContentPath || '').onChange(value => { this.plugin.settings.vaultContentPath = value; }));
            new Setting(containerEl).setName('Content Git root (absolute)').setDesc('Currently must equal the public content folder; never use the whole private vault.').addText(text => text.setValue(this.plugin.settings.contentGitPath || '').onChange(value => { this.plugin.settings.contentGitPath = value; }));
            new Setting(containerEl).setName('Hexo engine root (absolute, optional)').setDesc('Outside this vault. Explicit setup creates engine/content pointing INTO the public folder; it never runs Hexo.').addText(text => text.setValue(this.plugin.settings.hexoEnginePath || '').onChange(value => { this.plugin.settings.hexoEnginePath = value; }));
            new Setting(containerEl).setName('Watch public posts').setDesc('Opt in after validation. Apply configuration to activate.').addToggle(toggle => toggle.setValue(this.plugin.settings.autoSync).onChange(value => { this.plugin.settings.autoSync = value; }));
            new Setting(containerEl).setName('Commit public posts').setDesc('Local commits only unless push is separately enabled; unrelated staged work blocks commits.').addToggle(toggle => toggle.setValue(this.plugin.settings.autoCommit).onChange(value => { this.plugin.settings.autoCommit = value; }));
            new Setting(containerEl).setName('Push content commits').setDesc('May trigger your existing CI. Requires an existing, reviewed remote; off by default.').addToggle(toggle => toggle.setValue(this.plugin.settings.autoPush).onChange(value => { this.plugin.settings.autoPush = value; }));
            new Setting(containerEl).setName('Apply configuration').addButton(button => button.setButtonText('Validate and apply').onClick(async () => {
                try { await this.plugin.saveSettings(); new Notice('Configuration applied. No initial sync was run; watching follows your settings. Use Sync Now for existing changes.'); }
                catch (error) { new Notice(`Configuration not activated: ${error.message}`); }
            }));
            new Setting(containerEl).setName('Prepare local build link').setDesc('Uses the last applied configuration, not unsaved fields. Does not sync or push.').addButton(button => button.setButtonText('Validate and prepare').onClick(async () => {
                try { await this.plugin.prepareVaultBuild(); }
                catch (error) { new Notice(`Build setup refused: ${error.message}`); }
            }));
            return;
        }

        const hexoFolderSetting = new Setting(containerEl)
            .setName("Hexo Source Path")
            .setDesc("Absolute Hexo Git repository root. Sync uses source/_posts directly; the vault gets an inert reference, not an external directory link.")
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
                                this.plugin.settings.hexoSourcePath = selectedPath;
                                await this.plugin.saveSettings();
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
                .setButtonText("Create Safe Reference")
                .onClick(async () => {
                    if (this.plugin.settings.hexoSourcePath) {
                        addButton.setDisabled(true);

                        const addingNotice = new Notice("Adding...");

                        try {
                            // Create an inert reference; do not mount an external tree into the vault
                            const status = await this.plugin.createSymlink(this.plugin.settings.hexoSourcePath);

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
