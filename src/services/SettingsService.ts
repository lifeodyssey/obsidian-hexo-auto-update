import { Plugin } from "obsidian";
import { HexoIntegrationSettings } from "../types";
import { DEFAULT_SETTINGS } from "../constants";
import { SettingsService } from "../core/interfaces/SettingsService";

/**
 * Implementation of SettingsService that manages plugin settings
 */
export class SettingsServiceImpl implements SettingsService {
    private settings: HexoIntegrationSettings;
    private plugin: Plugin;

    /**
     * Constructor for SettingsServiceImpl
     * @param plugin The Obsidian plugin instance
     */
    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.settings = DEFAULT_SETTINGS;
    }

    /**
     * Load settings from storage
     */
    public async loadSettings(): Promise<void> {
        const loadedSettings = await this.plugin.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    }

    /**
     * Save current settings to storage
     */
    public async saveSettings(): Promise<void> {
        await this.plugin.saveData(this.settings);
    }

    /**
     * Get the current settings
     * @returns Current plugin settings
     */
    public getSettings(): HexoIntegrationSettings {
        return this.settings;
    }

    /**
     * Update a specific setting
     * @param key The setting key to update
     * @param value The new value for the setting
     */
    public updateSetting<T extends keyof HexoIntegrationSettings>(
        key: T, 
        value: HexoIntegrationSettings[T]
    ): void {
        this.settings[key] = value;
    }
} 
