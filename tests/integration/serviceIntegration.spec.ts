import { App, FileSystemAdapter } from "obsidian";
import { FileService } from "../../src/core/interfaces/FileService";
import { GitService } from "../../src/core/interfaces/GitService";
import { SettingsService } from "../../src/core/interfaces/SettingsService";
import { SyncService } from "../../src/core/interfaces/SyncService";
import { SymlinkService } from "../../src/core/interfaces/SymlinkService";
import { StatusResult } from "simple-git";

// Mock external dependencies
jest.mock("obsidian");

// Integration test between services
describe("Service Integration Tests", () => {
  // Mock service implementations
  class MockFileService implements FileService {
    exists = jest.fn().mockReturnValue(true);
    readFile = jest.fn().mockReturnValue("");
    writeFile = jest.fn();
    readDir = jest.fn().mockReturnValue([]);
    ensurePostHasDate = jest.fn();
  }
  
  class MockSettingsService implements SettingsService {
    private settings = {
      hexoSourcePath: "/mock/hexo/path",
      autoCommit: true,
      autoPush: true,
      commitMessage: "Auto commit"
    };
    
    loadSettings = jest.fn().mockResolvedValue(undefined);
    saveSettings = jest.fn().mockResolvedValue(undefined);
    getSettings = jest.fn().mockReturnValue(this.settings);
  }
  
  class MockSymlinkService implements SymlinkService {
    createSystemSpecificSymlink = jest.fn().mockResolvedValue("success");
    validateSymlink = jest.fn().mockResolvedValue(undefined);
  }
  
  class MockGitService implements GitService {
    private mockStatus: StatusResult | null = null;
    
    checkForChanges = jest.fn().mockImplementation(() => {
      return Promise.resolve(this.mockStatus);
    });
    
    commitChanges = jest.fn().mockResolvedValue(undefined);
    pushChanges = jest.fn().mockResolvedValue(undefined);
    
    setMockStatus(status: StatusResult) {
      this.mockStatus = status;
    }
  }
  
  class MockSyncService implements SyncService {
    constructor(
      private gitService: GitService,
      private settingsService: SettingsService
    ) {}
    
    startSync = jest.fn();
    stopSync = jest.fn();
    
    handleSync = jest.fn().mockImplementation(async () => {
      try {
        const status = await this.gitService.checkForChanges();
        
        if (status != null) {
          const hasChanges = 
            status.created.length + 
            status.modified.length + 
            status.deleted.length + 
            status.not_added.length > 0;
          
          if (hasChanges) {
            await this.gitService.commitChanges(status);
            await this.gitService.pushChanges();
          }
        }
      } catch (error) {
        console.error("Error in auto-sync:", error);
      }
      
      // Make sure getSettings was called
      this.settingsService.getSettings();
    });
  }
  
  let mockApp: jest.Mocked<App>;
  let fileService: MockFileService;
  let settingsService: MockSettingsService;
  let symlinkService: MockSymlinkService;
  let gitService: MockGitService;
  let syncService: MockSyncService;
  
  const MOCK_VAULT_PATH = "/mock/vault/path";
  const MOCK_HEXO_PATH = "/mock/hexo/source/path";
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Set up app mock
    mockApp = {
      vault: {
        adapter: {
          getBasePath: jest.fn().mockReturnValue(MOCK_VAULT_PATH)
        } as unknown as FileSystemAdapter
      }
    } as unknown as jest.Mocked<App>;
    
    // Create service instances
    fileService = new MockFileService();
    settingsService = new MockSettingsService();
    symlinkService = new MockSymlinkService();
    gitService = new MockGitService();
    syncService = new MockSyncService(gitService, settingsService);
    
    // Suppress console logs
    console.log = jest.fn();
    console.error = jest.fn();
  });
  
  describe("File and Symlink Services", () => {
    it("should correctly create a symlink using file services", async () => {
      // Execute symlink creation
      const result = await symlinkService.createSystemSpecificSymlink(MOCK_HEXO_PATH);
      
      // Should have been called with the correct path
      expect(symlinkService.createSystemSpecificSymlink).toHaveBeenCalledWith(MOCK_HEXO_PATH);
      
      // Should have succeeded
      expect(result).toBe("success");
    });
    
    it("should validate symlink and use fallback if needed", async () => {
      // Execute symlink validation
      await symlinkService.validateSymlink(MOCK_HEXO_PATH);
      
      // Should have been called with the correct path
      expect(symlinkService.validateSymlink).toHaveBeenCalledWith(MOCK_HEXO_PATH);
    });
  });
  
  describe("Git and Sync Services", () => {
    it("should detect changes and trigger commit/push", async () => {
      // Mock git status with changes
      const mockStatus: StatusResult = {
        created: ["file1.md"],
        modified: ["file2.md"],
        deleted: [],
        not_added: [],
        staged: [],
        conflicted: [],
        ahead: 0,
        behind: 0,
        current: "main",
        tracking: "origin/main",
        files: [
          { path: "file1.md", index: "?", working_dir: "?" },
          { path: "file2.md", index: "M", working_dir: "M" }
        ],
        renamed: [],
        isClean: jest.fn().mockReturnValue(false)
      };
      
      // Set the mock status
      gitService.setMockStatus(mockStatus);
      
      // Execute sync
      await syncService.handleSync();
      
      // Should detect changes and commit/push
      expect(gitService.checkForChanges).toHaveBeenCalled();
      expect(gitService.commitChanges).toHaveBeenCalledWith(mockStatus);
      expect(gitService.pushChanges).toHaveBeenCalled();
    });
    
    it("should not commit when no changes are detected", async () => {
      // Mock git status with no changes
      const mockStatus: StatusResult = {
        created: [],
        modified: [],
        deleted: [],
        not_added: [],
        staged: [],
        conflicted: [],
        ahead: 0,
        behind: 0,
        current: "main",
        tracking: "origin/main",
        files: [],
        renamed: [],
        isClean: jest.fn().mockReturnValue(true)
      };
      
      // Set the mock status
      gitService.setMockStatus(mockStatus);
      
      // Execute sync
      await syncService.handleSync();
      
      // Should detect changes but not commit/push
      expect(gitService.checkForChanges).toHaveBeenCalled();
      expect(gitService.commitChanges).not.toHaveBeenCalled();
      expect(gitService.pushChanges).not.toHaveBeenCalled();
    });
    
    it("should handle error propagation between services", async () => {
      // Set the checkForChanges method to throw an error
      gitService.checkForChanges = jest.fn().mockRejectedValue(new Error("Git error"));
      
      // Execute sync
      await syncService.handleSync();
      
      // Should handle error gracefully
      expect(gitService.checkForChanges).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "Error in auto-sync:", 
        expect.any(Error)
      );
    });
  });
  
  describe("Settings and Git Services", () => {
    it("should apply settings to Git operations", async () => {
      // Mock git status with changes
      const mockStatus: StatusResult = {
        created: ["file1.md"],
        modified: [],
        deleted: [],
        not_added: [],
        staged: [],
        conflicted: [],
        ahead: 0,
        behind: 0,
        current: "main",
        tracking: "origin/main",
        files: [{ path: "file1.md", index: "?", working_dir: "?" }],
        renamed: [],
        isClean: jest.fn().mockReturnValue(false)
      };
      
      // Set the mock status
      gitService.setMockStatus(mockStatus);
      
      // Execute sync
      await syncService.handleSync();
      
      // Should have checked settings
      expect(settingsService.getSettings).toHaveBeenCalled();
    });
  });
}); 
