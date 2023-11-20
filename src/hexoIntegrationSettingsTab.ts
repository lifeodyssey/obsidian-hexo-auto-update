import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import HexoIntegrationPlugin from "./hexoIntegrationPlugin";

const path = require('path');
const {dialog} = require('electron').remote;


export default class HexoIntegrationSettingsTab extends PluginSettingTab {
	plugin: HexoIntegrationPlugin;

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
							const status = await this.plugin.createSymlink();

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
