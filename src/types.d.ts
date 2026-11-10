export interface HexoIntegrationSettings {
	hexoSourcePath: string;
	contentMode?: 'external' | 'vault';
	vaultContentPath?: string;
	contentGitPath?: string;
	hexoEnginePath?: string;
	autoSync: boolean;
	autoCommit: boolean;
	autoPush: boolean;
	autoAddDate: boolean;
	autoGenerateTitle: boolean;
}
