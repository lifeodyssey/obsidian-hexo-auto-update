import {Notice, Plugin} from "obsidian";
import {HexoIntegrationSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";
import HexoIntegrationSettingsTab from "./settings/hexoIntegrationSettingsTab";
import { 
	FileServiceImpl, 
	GitServiceImpl, 
	SettingsServiceImpl, 
	SymlinkServiceImpl, 
	SyncServiceImpl 
} from "./services";
import { 
	FileService, 
	GitService, 
	SettingsService, 
	SymlinkService, 
	SyncService 
} from "./core/interfaces";

export default class HexoIntegrationPlugin extends Plugin {
	// Services
	private settingsService: SettingsService;
	private fileService: FileService;
	private symlinkService: SymlinkService;
	private gitService: GitService;
	private syncService: SyncService;

	// Settings
	settings: HexoIntegrationSettings;
	
	async onload() {
		// Initialize services
		this.fileService = new FileServiceImpl();
		this.settingsService = new SettingsServiceImpl(this);
		
		// Load settings
		await this.loadSettings();
		
		// Initialize other services with dependencies
		this.symlinkService = new SymlinkServiceImpl(this.app, this.fileService);
		
		// Settings tab
		this.addSettingTab(new HexoIntegrationSettingsTab(this.app, this));
		
		// Initialize GitService and SyncService only if hexoSourcePath is defined
		if (this.settings.hexoSourcePath) {
			this.initializeServices(this.settings.hexoSourcePath);
		} else {
			new Notice('Please configure the path to your Hexo blog in the settings.');
		}
	}
	
	/**
	 * Create a symlink to the Hexo blog
	 * This method is used by the settings tab
	 * @param hexoSourcePath Path to the hexo blog source
	 * @returns Status of the symlink creation
	 */
	public async createSymlink(hexoSourcePath: string): Promise<string> {
		return await this.symlinkService.createSystemSpecificSymlink(hexoSourcePath);
	}
	
	/**
	 * Initialize services that require hexoSourcePath
	 * @param hexoSourcePath Path to the hexo blog source
	 */
	private initializeServices(hexoSourcePath: string) {
		// Initialize Git service
		this.gitService = new GitServiceImpl(hexoSourcePath, this.fileService);
		
		// Initialize Sync service
		this.syncService = new SyncServiceImpl(this.gitService, this.settingsService);
		
		// Validate symlink
		this.validateSymlink(hexoSourcePath);
		
		// Start auto-sync
		this.syncService.startSync();
	}
	
	/**
	 * Validate symlink to Hexo blog
	 * @param hexoSourcePath Path to the hexo blog source
	 */
	private async validateSymlink(hexoSourcePath: string) {
		try {
			await this.symlinkService.validateSymlink(hexoSourcePath);
		} catch (error) {
			console.error("Error validating symlink:", error);
			new Notice('Error validating symlink to Hexo blog. Please check settings.');
		}
	}

	onunload() {
		// Stop sync when plugin is disabled
		if (this.syncService) {
			this.syncService.stopSync();
		}
	}

	async loadSettings() {
		// Use settingsService to load settings
		await this.settingsService.loadSettings();
		this.settings = this.settingsService.getSettings();
	}

	async saveSettings() {
		// Use settingsService to save settings
		await this.settingsService.saveSettings();
		
		// Reinitialize services if settings changed and hexoSourcePath is defined
		if (this.settings.hexoSourcePath) {
			this.initializeServices(this.settings.hexoSourcePath);
		}
	}
}

