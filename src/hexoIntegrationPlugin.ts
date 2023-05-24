import { App, FileSystemAdapter, Plugin } from "obsidian";
import { HexoIntegrationSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import HexoIntegrationSettingsTab from "./hexoIntegrationSettingsTab";
import { createHexoSymlink } from "./hexoIntegrationHelper";


export default class HexoIntegrationPlugin extends Plugin {
	settings: HexoIntegrationSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
	}

	onunload() {}

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
			const result = await createHexoSymlink(
				this.app,
				this.settings.hexoSourcePath
			);

			return result;
		} catch (error) {
			throw new Error(`Failed to create symlink: ${error.message}`);
		}
	}
}
