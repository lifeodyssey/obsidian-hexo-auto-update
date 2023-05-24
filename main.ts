import { App, FileSystemAdapter, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
const symlinkDir = require('symlink-dir');
const path = require('path');

interface HexoIntegrationSettings {
	hexoSourcePath: string;
	hexoFolderPath: string;
}

const DEFAULT_SETTINGS: HexoIntegrationSettings = {
	hexoSourcePath: '',
	hexoFolderPath: '',
};

export default class HexoIntegrationPlugin extends Plugin {
	settings: HexoIntegrationSettings;

	async createHexoSymlink(): Promise<string> {
		try {
			const vaultPath = (
				this.app.vault.adapter as FileSystemAdapter
			).getBasePath()

			const hexoFolderName = this.settings.hexoSourcePath.split('/').pop();

			const newFolderPath = path.join(vaultPath, hexoFolderName);

			const result = await symlinkDir(this.settings.hexoSourcePath, newFolderPath);

			if (result.reused) {
				console.log('Symlink already exists and has been reused:', newFolderPath);
			} else {
				console.log('Symlink successfully created:', newFolderPath);
			}

			return 'success';
		} catch (error) {
			console.error('Failed to create symlink:', error);
			return 'failure';
		}
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class HexoIntegrationSettingsTab extends PluginSettingTab {
	plugin: HexoIntegrationPlugin;

	constructor(app: App, plugin: HexoIntegrationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for Hexo Integration Plugin.' });

		const hexoFolderSetting = new Setting(containerEl)
			.setName('Hexo Source Path')
			.setDesc('Specify the path to the Hexo source folder');
		const hexoFolderInput = hexoFolderSetting.addText(text => text
			.setPlaceholder('Enter the source path')
			.setValue(this.plugin.settings.hexoSourcePath)
			.onChange(async (value) => {
				console.log('Hexo Source Path: ' + value);
				this.plugin.settings.hexoSourcePath = value;
				await this.plugin.saveSettings();
			}));
		const addButton = hexoFolderSetting.addButton(button => button
			.setButtonText('Add')
			.onClick(async () => {
				if (this.plugin.settings.hexoSourcePath) {
					addButton.setDisabled(true);

					const addingNotice = new Notice('Adding...');

					const status = await this.plugin.createHexoSymlink();

					addingNotice.hide();

					new Notice(status);

				} else {
					new Notice('Please set the Hexo path in the plugin settings before creating the folder.');
				}
			}));
	}
}
