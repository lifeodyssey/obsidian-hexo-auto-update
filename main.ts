import { App, FileSystemAdapter, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
const symlinkDir = require('symlink-dir');
const path = require('path');

interface MyPluginSettings {
	sourcePath: string;
	hexoFolderPath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	sourcePath: '',
	hexoFolderPath: '',
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async simulateSymlinkImplementation(): Promise<string> {
		try {
			const vaultPath = (
				this.app.vault.adapter as FileSystemAdapter
			).getBasePath()

			const hexoFolderName = this.settings.sourcePath.split('/').pop();

			const newFolderPath = path.join(vaultPath, hexoFolderName);

			const result = await symlinkDir(this.settings.sourcePath, newFolderPath);

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

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for my awesome plugin.' });

		const hexoFolderSetting = new Setting(containerEl)
			.setName('Source Path')
			.setDesc('Specify the path to the Hexo source folder');
		const hexoFolderInput = hexoFolderSetting.addText(text => text
			.setPlaceholder('Enter the source path')
			.setValue(this.plugin.settings.sourcePath)
			.onChange(async (value) => {
				console.log('Source Path: ' + value);
				this.plugin.settings.sourcePath = value;
				await this.plugin.saveSettings();
			}));
		const addButton = hexoFolderSetting.addButton(button => button
			.setButtonText('Add')
			.onClick(async () => {
				if (this.plugin.settings.sourcePath) {
					addButton.setDisabled(true);

					const addingNotice = new Notice('Adding...');

					const status = await this.plugin.simulateSymlinkImplementation();

					addingNotice.hide();

					new Notice(status);

				} else {
					new Notice('Please set the Hexo path in the plugin settings before creating the folder.');
				}
			}));
	}
}
