import { App, Editor, FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
const symlinkDir =require( 'symlink-dir'); // Import the symlinkDir function from the 'symlink-dir' package
const path= require('path');
// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	sourcePath: string;
	hexoFolderPath:string

}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	sourcePath: '' ,// Set the default source path to an empty string,
	hexoFolderPath:''
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	async simulateSymlinkImplementation(): Promise<string> {
		try {
			// Get the root path of the Obsidian vault
			const vaultPath = (
				this.app.vault.adapter as FileSystemAdapter
			).getBasePath()
			// Get the last part of the Hexo path
			const hexoFolderName = this.settings.sourcePath.split('/').pop();

			// Create the new folder path inside the vault root path
			const newFolderPath = path.join(vaultPath, hexoFolderName);

			// Create the symlink between the Hexo path and the new folder path
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

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
		// Add a new setting for the source path

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
				// Check if the path is not null
				if (this.plugin.settings.sourcePath) {
					// Make the button unclickable and change the text
					addButton.setDisabled(true);

					// Show a notice that the symlink process has started
					const addingNotice = new Notice('Adding...');

					// Call the simulateSymlinkImplementation function
					const status = await this.plugin.simulateSymlinkImplementation();

					// Clear the initial notice
					addingNotice.hide();

					// Show the returned status in a new notice
					new Notice(status);

					// Change the button text back to "Add" and re-enable it
				} else {
					new Notice('Please set the Hexo path in the plugin settings before creating the folder.');
				}
			}));


	}
}

