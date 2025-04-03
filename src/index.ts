import {Notice, Plugin} from "obsidian";
import {HexoIntegrationSettings} from "./types";
import {DEFAULT_SETTINGS} from "./constants";
import HexoIntegrationSettingsTab from "./settings/hexoIntegrationSettingsTab";
import { 
	FileServiceImpl, 
	GitServiceImpl, 
	SettingsServiceImpl, 
	SymlinkServiceImpl, 
	SyncServiceImpl,
	ErrorServiceImpl
} from "./services";
import { 
	FileService, 
	GitService, 
	SettingsService, 
	SymlinkService, 
	SyncService,
	ErrorService
} from "./core/interfaces";
import { ErrorSeverity } from "./core/interfaces/ErrorService";

export default class HexoIntegrationPlugin extends Plugin {
	// Services
	private settingsService: SettingsService;
	private fileService: FileService;
	private symlinkService: SymlinkService;
	private gitService: GitService;
	private syncService: SyncService;
	private errorService: ErrorService;

	// Settings
	settings: HexoIntegrationSettings;
	
	async onload() {
		try {
			// Initialize error service first
			this.errorService = ErrorServiceImpl.getInstance();
			
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
				await this.initializeServices(this.settings.hexoSourcePath);
			} else {
				new Notice('Please configure the path to your Hexo blog in the settings.');
			}
		} catch (error) {
			// If error service is initialized, use it, otherwise fallback to console
			if (this.errorService) {
				this.errorService.handleError(
					error, 
					'Plugin Initialization', 
					ErrorSeverity.CRITICAL
				);
			} else {
				console.error('Failed to initialize plugin:', error);
				new Notice('Failed to initialize Hexo Integration plugin.');
			}
		}
	}
	
	/**
	 * Create a symlink to the Hexo blog
	 * This method is used by the settings tab
	 * @param hexoSourcePath Path to the hexo blog source
	 * @returns Status of the symlink creation
	 */
	public async createSymlink(hexoSourcePath: string): Promise<string> {
		try {
			return await this.symlinkService.createSystemSpecificSymlink(hexoSourcePath);
		} catch (error) {
			this.errorService.handleError(
				error, 
				'Symlink Creation', 
				ErrorSeverity.ERROR
			);
			return 'failure';
		}
	}
	
	/**
	 * Initialize services that require hexoSourcePath
	 * @param hexoSourcePath Path to the hexo blog source
	 */
	private async initializeServices(hexoSourcePath: string) {
		try {
			// Initialize Git service
			this.gitService = new GitServiceImpl(hexoSourcePath, this.fileService);
			
			// Initialize Sync service
			this.syncService = new SyncServiceImpl(
				this.gitService, 
				this.settingsService,
				this.errorService
			);
			
			// Validate symlink
			await this.validateSymlink(hexoSourcePath);
			
			// Start auto-sync
			this.syncService.startSync();
		} catch (error) {
			this.errorService.handleErrorWithRecovery(
				error, 
				'Service Initialization',
				async () => {
					// Try with a delay in case it's a timing issue
					await new Promise(resolve => setTimeout(resolve, 1000));
					
					// Attempt to initialize git service again
					this.gitService = new GitServiceImpl(hexoSourcePath, this.fileService);
					
					// Simplified sync service initialization
					this.syncService = new SyncServiceImpl(
						this.gitService, 
						this.settingsService,
						this.errorService
					);
					this.syncService.startSync();
					return true;
				}
			);
		}
	}
	
	/**
	 * Validate symlink to Hexo blog
	 * @param hexoSourcePath Path to the hexo blog source
	 */
	private async validateSymlink(hexoSourcePath: string) {
		try {
			await this.symlinkService.validateSymlink(hexoSourcePath);
		} catch (error) {
			await this.errorService.handleErrorWithRecovery(
				error, 
				'Symlink Validation',
				async () => {
					// Attempt to recreate the symlink as recovery
					return await this.symlinkService.createSystemSpecificSymlink(hexoSourcePath);
				}
			);
		}
	}

	onunload() {
		try {
			// Stop sync when plugin is disabled
			if (this.syncService) {
				this.syncService.stopSync();
			}
		} catch (error) {
			if (this.errorService) {
				this.errorService.logError(
					error, 
					'Plugin Unload', 
					ErrorSeverity.WARNING
				);
			} else {
				console.error('Error during plugin unload:', error);
			}
		}
	}

	async loadSettings() {
		try {
			// Use settingsService to load settings
			await this.settingsService.loadSettings();
			this.settings = this.settingsService.getSettings();
		} catch (error) {
			this.errorService.handleError(
				error, 
				'Settings Load', 
				ErrorSeverity.ERROR
			);
			
			// Fallback to default settings
			this.settings = DEFAULT_SETTINGS;
		}
	}

	async saveSettings() {
		try {
			// Use settingsService to save settings
			await this.settingsService.saveSettings();
			
			// Reinitialize services if settings changed and hexoSourcePath is defined
			if (this.settings.hexoSourcePath) {
				await this.initializeServices(this.settings.hexoSourcePath);
			}
		} catch (error) {
			this.errorService.handleError(
				error, 
				'Settings Save', 
				ErrorSeverity.ERROR
			);
		}
	}
}

