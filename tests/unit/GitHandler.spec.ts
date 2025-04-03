import { GitHandler } from '../../src/git/handler';
import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

// Manual mocks for dependencies
jest.mock('simple-git', () => {
  const mockSimpleGit = jest.fn().mockReturnValue({
    status: jest.fn(),
    add: jest.fn(),
    commit: jest.fn(),
    push: jest.fn()
  });
  return {
    simpleGit: mockSimpleGit
  };
});

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
}));

describe('GitHandler', () => {
  let gitHandler: GitHandler;
  let mockGit: jest.Mocked<SimpleGit>;
  const mockRepoPath = '/fake/repo/path';
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Setup mock for simpleGit
    mockGit = {
      status: jest.fn(),
      add: jest.fn(),
      commit: jest.fn(),
      push: jest.fn()
    } as unknown as jest.Mocked<SimpleGit>;
    
    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    
    // Create the GitHandler instance
    gitHandler = new GitHandler(mockRepoPath);
  });
  
  describe('checkForChanges', () => {
    it('should return null when no changes in _posts directory', async () => {
      // Setup
      const mockStatus: StatusResult = {
        files: [{ path: 'some/other/file.md', working_dir: 'M', index: 'M' }],
        not_added: [],
        conflicted: [],
        created: [],
        deleted: [],
        modified: [],
        renamed: [],
        staged: [],
        ahead: 0,
        behind: 0,
        current: 'main',
        tracking: 'origin/main',
        detached: false,
        isClean: jest.fn()
      };
      
      mockGit.status.mockResolvedValue(mockStatus);
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Execute
      const result = await gitHandler.checkForChanges();
      
      // Verify
      expect(result).toBeNull();
      expect(mockGit.status).toHaveBeenCalledTimes(1);
    });
    
    it('should return status when changes in _posts directory', async () => {
      // Setup
      const mockStatus: StatusResult = {
        files: [{ path: 'source/_posts/file.md', working_dir: 'M', index: 'M' }],
        not_added: [],
        conflicted: [],
        created: [],
        deleted: [],
        modified: ['source/_posts/file.md'],
        renamed: [],
        staged: [],
        ahead: 0,
        behind: 0,
        current: 'main',
        tracking: 'origin/main',
        detached: false,
        isClean: jest.fn()
      };
      
      mockGit.status.mockResolvedValue(mockStatus);
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Execute
      const result = await gitHandler.checkForChanges();
      
      // Verify
      expect(result).not.toBeNull();
      expect(result).toEqual(mockStatus);
      expect(mockGit.status).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('commitChanges', () => {
    it('should stage all changes and commit with appropriate message', async () => {
      // Setup
      const mockStatus: StatusResult = {
        files: [],
        not_added: ['source/_posts/new.md'],
        conflicted: [],
        created: ['source/_posts/created.md'],
        deleted: ['source/_posts/deleted.md'],
        modified: ['source/_posts/modified.md'],
        renamed: [],
        staged: [],
        ahead: 0,
        behind: 0,
        current: 'main',
        tracking: 'origin/main',
        detached: false,
        isClean: jest.fn()
      };
      
      // Mock Date to have a consistent timestamp for testing
      const mockDate = new Date('2023-01-01T12:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);
      
      // Execute
      await gitHandler.commitChanges(mockStatus);
      
      // Verify
      expect(mockGit.add).toHaveBeenCalledWith('.');
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('Changes at 2023-01-01T12:00:00.000Z')
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('A: source/_posts/created.md')
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('M: source/_posts/modified.md')
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('D: source/_posts/deleted.md')
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.stringContaining('U: source/_posts/new.md')
      );
    });
  });
  
  describe('pushChanges', () => {
    it('should push changes to remote', async () => {
      // Execute
      await gitHandler.pushChanges();
      
      // Verify
      expect(mockGit.push).toHaveBeenCalledTimes(1);
    });
  });
}); 
