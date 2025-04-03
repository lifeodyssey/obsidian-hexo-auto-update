import SettingsManager from '../../src/SettingManager';
import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/constants';
import { HexoIntegrationSettings } from '../../src/types';

// No need to mock obsidian as we've set up the module name mapper in jest.config.ts

describe('SettingsManager', () => {
  let settingsManager: SettingsManager;
  let mockPlugin: jest.Mocked<Plugin>;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Setup mock for Plugin
    mockPlugin = {
      loadData: jest.fn(),
      saveData: jest.fn()
    } as unknown as jest.Mocked<Plugin>;
    
    // Create the SettingsManager instance
    settingsManager = new SettingsManager(mockPlugin);
  });
  
  describe('loadSettings', () => {
    it('should load default settings when no saved settings exist', async () => {
      // Setup
      mockPlugin.loadData.mockResolvedValue(undefined);
      
      // Execute
      await settingsManager.loadSettings();
      
      // Verify
      expect(mockPlugin.loadData).toHaveBeenCalledTimes(1);
      expect(settingsManager.getSettings()).toEqual(DEFAULT_SETTINGS);
    });
    
    it('should merge saved settings with default settings', async () => {
      // Setup
      const savedSettings: Partial<HexoIntegrationSettings> = {
        hexoSourcePath: '/custom/hexo/path'
      };
      mockPlugin.loadData.mockResolvedValue(savedSettings);
      
      // Execute
      await settingsManager.loadSettings();
      
      // Verify
      expect(mockPlugin.loadData).toHaveBeenCalledTimes(1);
      expect(settingsManager.getSettings()).toEqual({
        ...DEFAULT_SETTINGS,
        ...savedSettings
      });
    });
  });
  
  describe('saveSettings', () => {
    it('should save the current settings', async () => {
      // Setup
      mockPlugin.saveData.mockResolvedValue(undefined);
      
      // Execute
      await settingsManager.saveSettings();
      
      // Verify
      expect(mockPlugin.saveData).toHaveBeenCalledTimes(1);
      expect(mockPlugin.saveData).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    });
  });
  
  describe('updateSetting', () => {
    it('should update a specific setting', () => {
      // Setup
      const newPath = '/updated/hexo/path';
      
      // Execute
      settingsManager.updateSetting('hexoSourcePath', newPath);
      
      // Verify
      expect(settingsManager.getSettings().hexoSourcePath).toBe(newPath);
    });
  });
}); 
