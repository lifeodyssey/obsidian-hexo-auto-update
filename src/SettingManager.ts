import { Plugin } from "obsidian";
import {HexoIntegrationSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";

class SettingsManager {
    private settings: HexoIntegrationSettings;

    constructor(private plugin: Plugin) {
        this.settings = DEFAULT_SETTINGS; // Initialize with default settings
    }

    async loadSettings(): Promise<void> {
        const loadedSettings = await this.plugin.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    }

    public async saveSettings(): Promise<void> {
        await this.plugin.saveData(this.settings);
    }

    // Method to get the current settings
    getSettings(): HexoIntegrationSettings {
        return this.settings;
    }

    // Method to update a specific setting
    updateSetting<T extends keyof HexoIntegrationSettings>(key: T, value: HexoIntegrationSettings[T]): void {
        this.settings[key] = value;
    }
}

export default SettingsManager;
