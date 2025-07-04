import { Notice } from "obsidian";
import { SyncServiceImpl } from "../../src/services/SyncService";
import { GitService } from "../../src/core/interfaces/GitService";
import { SettingsService } from "../../src/core/interfaces/SettingsService";
import { ErrorService } from "../../src/core/interfaces/ErrorService";
import { StatusResult } from "simple-git";

// Mock the dependencies
jest.mock("obsidian");

// Create a class-level mock object for setInterval and clearInterval
// since we need to properly simulate interval setup and clearing
class TimerMock {
  private intervalMap = new Map<NodeJS.Timeout, () => void>();
  private currentId: number = 1;
  
  setInterval(callback: () => void, _msec: number): NodeJS.Timeout {
    const id = this.currentId++ as unknown as NodeJS.Timeout;
    this.intervalMap.set(id, callback);
    return id;
  }
  
  clearInterval(id: NodeJS.Timeout): void {
    this.intervalMap.delete(id);
  }
  
  // Helper method to get the interval count
  getIntervalCount(): number {
    return this.intervalMap.size;
  }
}

// Create a timer mock instance
const timerMock = new TimerMock();

// Override global setInterval and clearInterval
global.setInterval = jest.fn().mockImplementation(timerMock.setInterval.bind(timerMock));
global.clearInterval = jest.fn().mockImplementation(timerMock.clearInterval.bind(timerMock));

describe("SyncService", () => {
  let syncService: SyncServiceImpl;
  let mockGitService: jest.Mocked<GitService>;
  let mockSettingsService: jest.Mocked<SettingsService>;
  let mockErrorService: jest.Mocked<ErrorService>;
  
  // Mock for console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up the mock services
    mockGitService = {
      checkForChanges: jest.fn(),
      commitChanges: jest.fn(),
      pushChanges: jest.fn()
    } as unknown as jest.Mocked<GitService>;
    
    mockSettingsService = {} as jest.Mocked<SettingsService>;
    
    mockErrorService = {
      handleError: jest.fn(),
      handleErrorWithRecovery: jest.fn(),
      logError: jest.fn(),
      logWarning: jest.fn(),
      logInfo: jest.fn(),
      getErrorLog: jest.fn()
    } as jest.Mocked<ErrorService>;
    
    // Create the service instance
    syncService = new SyncServiceImpl(mockGitService, mockSettingsService, mockErrorService);
    
    // Mock console methods to avoid test output pollution
    console.log = jest.fn();
    console.error = jest.fn();
  });
  
  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });
  
  describe("startSync", () => {
    it("should start the auto-sync interval", () => {
      syncService.startSync();
      
      expect(global.setInterval).toHaveBeenCalled();
      expect(mockErrorService.logError).toHaveBeenCalledWith(
        expect.stringContaining("Auto-sync started with interval:"),
        "SyncService",
        expect.any(String)
      );
    });
    
    it("should clear existing interval before starting a new one", () => {
      // Call startSync once to set up the interval
      syncService.startSync();
      
      // Clear mock to focus on second call
      jest.clearAllMocks();
      
      // Call startSync again to test if it clears the previous interval
      syncService.startSync();
      
      // Should be called once to clear the interval
      expect(global.clearInterval).toHaveBeenCalledTimes(1);
      
      // Should set up a new interval
      expect(global.setInterval).toHaveBeenCalledTimes(1);
    });
  });
  
  describe("stopSync", () => {
    it("should stop the auto-sync interval", () => {
      // Set up the autoSyncIntervalId
      syncService.startSync();
      
      // Clear the mock to focus on stopSync behavior
      jest.clearAllMocks();
      
      syncService.stopSync();
      
      expect(global.clearInterval).toHaveBeenCalled();
      expect(mockErrorService.logError).toHaveBeenCalledWith(
        "Auto-sync stopped",
        "SyncService",
        expect.any(String)
      );
    });
    
    it("should not call clearInterval if no interval is set", () => {
      // Make sure no interval is set
      (syncService as any).autoSyncIntervalId = null;
      
      // Call stopSync directly without setting up the interval
      syncService.stopSync();
      
      expect(global.clearInterval).not.toHaveBeenCalled();
    });
  });
  
  describe("handleSync", () => {
    it("should commit and push changes when changes are detected", async () => {
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
        detached: false,
        files: [
          { path: "file1.md", index: "?", working_dir: "?" },
          { path: "file2.md", index: "M", working_dir: "M" }
        ],
        renamed: [],
        isClean: jest.fn().mockReturnValue(false)
      };
      
      mockGitService.checkForChanges.mockResolvedValue(mockStatus);
      
      await syncService.handleSync();
      
      // Should call git operations to commit and push
      expect(mockGitService.commitChanges).toHaveBeenCalledWith(mockStatus);
      expect(mockGitService.pushChanges).toHaveBeenCalled();
      
      // Should show a success notice
      expect(Notice).toHaveBeenCalledWith(
        expect.stringContaining("Changes committed and pushed successfully")
      );
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
        detached: false,
        files: [],
        renamed: [],
        isClean: jest.fn().mockReturnValue(true)
      };
      
      mockGitService.checkForChanges.mockResolvedValue(mockStatus);
      
      await syncService.handleSync();
      
      // Should not call git operations to commit and push
      expect(mockGitService.commitChanges).not.toHaveBeenCalled();
      expect(mockGitService.pushChanges).not.toHaveBeenCalled();
    });
    
    it("should handle null status from git service", async () => {
      // Mock null status (repo not initialized or other issue)
      mockGitService.checkForChanges.mockResolvedValue(null);
      
      await syncService.handleSync();
      
      // Should not call git operations
      expect(mockGitService.commitChanges).not.toHaveBeenCalled();
      expect(mockGitService.pushChanges).not.toHaveBeenCalled();
    });
    
    it("should handle error during git operations", async () => {
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
        detached: false,
        files: [{ path: "file1.md", index: "A", working_dir: "?" }],
        renamed: [],
        isClean: jest.fn().mockReturnValue(false)
      };
      
      // Set up the test to handle error during commit
      mockGitService.checkForChanges.mockResolvedValue(mockStatus);
      mockGitService.commitChanges.mockRejectedValue(new Error("Commit failed"));
      
      await syncService.handleSync();
      
      // Should handle error with recovery
      expect(mockErrorService.handleErrorWithRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        "Commit and Push",
        expect.any(Function)
      );
      
      // Should call commitChanges but not pushChanges
      expect(mockGitService.commitChanges).toHaveBeenCalled();
      expect(mockGitService.pushChanges).not.toHaveBeenCalled();
    });
    
    it("should handle error during changes check", async () => {
      // Set up the test to throw error during checkForChanges
      mockGitService.checkForChanges.mockRejectedValue(new Error("Git error"));
      
      await syncService.handleSync();
      
      // Should handle error with recovery
      expect(mockErrorService.handleErrorWithRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        "Auto-Sync Process",
        expect.any(Function)
      );
      
      // Should not attempt any git operations
      expect(mockGitService.commitChanges).not.toHaveBeenCalled();
      expect(mockGitService.pushChanges).not.toHaveBeenCalled();
    });
  });
}); 
