import { HexoIntegrationSettings } from "../../types";

/**
 * Interface for Settings management
 * This follows the Dependency Inversion Principle from SOLID
 */
export interface SettingsService {
    /**
     * Load settings from storage
     */
    loadSettings(): Promise<void>;
    
    /**
     * Save current settings to storage
     */
    saveSettings(): Promise<void>;
    
    /**
     * Get the current settings
     * @returns Current plugin settings
     */
    getSettings(): HexoIntegrationSettings;
    
    /**
     * Update a specific setting
     * @param key The setting key to update
     * @param value The new value for the setting
     */
    updateSetting<T extends keyof HexoIntegrationSettings>(
        key: T, 
        value: HexoIntegrationSettings[T]
    ): void;
} 
