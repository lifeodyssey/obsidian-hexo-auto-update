import * as fs from 'fs';
import * as path from 'path';
import { FileServiceImpl } from '../../src/services/FileService';

// Mock fs functions
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    readdirSync: jest.fn()
}));

describe('FileService', () => {
    let fileService: FileServiceImpl;
    
    beforeEach(() => {
        fileService = new FileServiceImpl();
        jest.clearAllMocks();
    });
    
    describe('exists', () => {
        it('should call fs.existsSync with the correct path', () => {
            const testPath = '/test/path';
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            
            const result = fileService.exists(testPath);
            
            expect(fs.existsSync).toHaveBeenCalledWith(testPath);
            expect(result).toBe(true);
        });
    });
    
    describe('readFile', () => {
        it('should call fs.readFileSync with the correct path and encoding', () => {
            const testPath = '/test/path/file.txt';
            const fileContent = 'file content';
            (fs.readFileSync as jest.Mock).mockReturnValue(fileContent);
            
            const result = fileService.readFile(testPath);
            
            expect(fs.readFileSync).toHaveBeenCalledWith(testPath, 'utf-8');
            expect(result).toBe(fileContent);
        });
    });
    
    describe('writeFile', () => {
        it('should call fs.writeFileSync with the correct path, content, and encoding', () => {
            const testPath = '/test/path/file.txt';
            const fileContent = 'new file content';
            
            fileService.writeFile(testPath, fileContent);
            
            expect(fs.writeFileSync).toHaveBeenCalledWith(testPath, fileContent, 'utf-8');
        });
    });
    
    describe('readDir', () => {
        it('should call fs.readdirSync with the correct path', () => {
            const testPath = '/test/path/dir';
            const filesList = ['file1.txt', 'file2.txt'];
            (fs.readdirSync as jest.Mock).mockReturnValue(filesList);
            
            const result = fileService.readDir(testPath);
            
            expect(fs.readdirSync).toHaveBeenCalledWith(testPath);
            expect(result).toEqual(filesList);
        });
    });
    
    describe('ensurePostHasDate', () => {
        it('should add date to front matter if it does not exist', async () => {
            const testPath = '/test/path/post.md';
            const originalContent = '---\ntitle: Test Post\n---\n\nContent';
            const expectedNewContent = expect.stringMatching(/^---\ndate: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\ntitle: Test Post\n---\n\nContent$/);
            
            (fs.readFileSync as jest.Mock).mockReturnValue(originalContent);
            
            await fileService.ensurePostHasDate(testPath);
            
            expect(fs.readFileSync).toHaveBeenCalledWith(testPath, 'utf-8');
            expect(fs.writeFileSync).toHaveBeenCalledWith(testPath, expect.any(String), 'utf-8');
            expect((fs.writeFileSync as jest.Mock).mock.calls[0][1]).toMatch(expectedNewContent);
        });
        
        it('should not modify front matter if date already exists', async () => {
            const testPath = '/test/path/post.md';
            const originalContent = '---\ndate: 2023-01-01 12:00:00\ntitle: Test Post\n---\n\nContent';
            
            (fs.readFileSync as jest.Mock).mockReturnValue(originalContent);
            
            await fileService.ensurePostHasDate(testPath);
            
            expect(fs.readFileSync).toHaveBeenCalledWith(testPath, 'utf-8');
            expect(fs.writeFileSync).not.toHaveBeenCalled();
        });
        
        it('should add front matter with date if no front matter exists', async () => {
            const testPath = '/test/path/post.md';
            const originalContent = 'Content without front matter';
            const expectedNewContent = expect.stringMatching(/^---\ndate: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n---\n\nContent without front matter$/);
            
            (fs.readFileSync as jest.Mock).mockReturnValue(originalContent);
            
            await fileService.ensurePostHasDate(testPath);
            
            expect(fs.readFileSync).toHaveBeenCalledWith(testPath, 'utf-8');
            expect(fs.writeFileSync).toHaveBeenCalledWith(testPath, expect.any(String), 'utf-8');
            expect((fs.writeFileSync as jest.Mock).mock.calls[0][1]).toMatch(expectedNewContent);
        });
        
        it('should handle errors gracefully', async () => {
            const testPath = '/test/path/post.md';
            const error = new Error('Read error');
            
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw error;
            });
            
            console.error = jest.fn();
            
            await fileService.ensurePostHasDate(testPath);
            
            expect(fs.readFileSync).toHaveBeenCalledWith(testPath, 'utf-8');
            expect(console.error).toHaveBeenCalledWith(`Error processing date in post ${testPath}:`, error);
        });
    });
}); 
