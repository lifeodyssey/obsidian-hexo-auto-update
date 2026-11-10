import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { platform, tmpdir } from 'os';
import type { App } from 'obsidian';

jest.mock('obsidian', () => ({ Notice: jest.fn(), FileSystemAdapter: class {} }), { virtual: true });
import { SymlinkServiceV2 } from '../../src/services/SymlinkServiceV2';

describe('non-destructive blog links (real temporary filesystem)', () => {
    let root: string;
    let vault: string;
    let blog: string;
    let link: string;
    let service: SymlinkServiceV2;
    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), 'hexo-link-safe-'));
        vault = join(root, 'vault');
        blog = join(root, 'blog');
        await fs.mkdir(vault);
        await fs.mkdir(blog);
        link = join(vault, platform() === 'darwin' ? 'Mac Blog' : platform() === 'win32' ? 'Win Blog' : 'Hexo Blog');
        service = new SymlinkServiceV2({ vault: { adapter: { getBasePath: () => vault } } } as unknown as App);
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        await fs.rm(root, { recursive: true, force: true });
    });

    it('creates a plain reference then recreates it idempotently without writing into the blog', async () => {
        await fs.writeFile(join(blog, 'README.md'), 'my blog readme');
        expect((await service.createSafeSymlink(blog)).success).toBe(true);
        expect((await service.createSafeSymlink(blog)).success).toBe(true);
        expect(await fs.readFile(join(blog, 'README.md'), 'utf8')).toBe('my blog readme');
        await expect(fs.lstat(join(blog, '.hexo-config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await service.getBlogPath()).toBe(await fs.realpath(blog));
        expect((await fs.lstat(link)).isSymbolicLink()).toBe(false);
    });

    it('rejects even a correct relative legacy symlink for manual migration', async () => {
        await fs.symlink(relative(vault, blog), link, 'dir');
        expect(await service.validateSymlink(blog)).toMatchObject({ isValid: false, type: 'symlink', needsRecreation: true, needsMigration: true });
        expect(await service.createSafeSymlink(blog)).toMatchObject({ success: false, needsMigration: true });
        expect(await fs.readlink(link)).toBe(relative(vault, blog));
        expect(await service.getBlogPath()).toBeNull();
    });

    it('preserves a real directory and its README instead of turning it into a fallback', async () => {
        await fs.mkdir(link);
        await fs.writeFile(join(link, 'README.md'), 'user notes');
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
        expect(await fs.readFile(join(link, 'README.md'), 'utf8')).toBe('user notes');
        await expect(fs.lstat(join(link, '.hexo-config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('does not delete a valid fallback containing user files', async () => {
        await fs.mkdir(link);
        await fs.writeFile(join(link, '.hexo-config.json'), JSON.stringify({ linkType: 'reference', blogPath: blog }));
        await fs.writeFile(join(link, 'personal.md'), 'irreplaceable');
        expect(await service.createSafeSymlink(blog)).toMatchObject({ success: true, fallback: true });
        expect(await fs.readFile(join(link, 'personal.md'), 'utf8')).toBe('irreplaceable');
        expect((await fs.lstat(link)).isDirectory()).toBe(true);
    });

    it('does not delete or rewrite an old fallback for a different blog', async () => {
        await fs.mkdir(link);
        const other = join(root, 'other');
        await fs.mkdir(other);
        const config = JSON.stringify({ linkType: 'reference', blogPath: other });
        await fs.writeFile(join(link, '.hexo-config.json'), config);
        await fs.writeFile(join(link, 'personal.md'), 'keep');
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
        expect(await fs.readFile(join(link, '.hexo-config.json'), 'utf8')).toBe(config);
        expect(await fs.readFile(join(link, 'personal.md'), 'utf8')).toBe('keep');
    });

    it('preserves wrong and dangling symlinks without removing targets', async () => {
        const missing = join(root, 'missing');
        await fs.symlink(missing, link, 'dir');
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
        expect(await fs.readlink(link)).toBe(missing);
        expect(await service.validateSymlink(blog)).toMatchObject({ isValid: false, type: 'symlink' });
        expect(await service.getBlogPath()).toBeNull();
    });

    it('rejects malformed and symlinked reference metadata without reading it as a valid reference', async () => {
        await fs.mkdir(link);
        const config = join(root, 'outside-config.json');
        await fs.writeFile(config, JSON.stringify({ linkType: 'reference', blogPath: blog }));
        await fs.symlink(config, join(link, '.hexo-config.json'));
        expect((await service.validateSymlink(blog)).isValid).toBe(false);
        expect(await service.getBlogPath()).toBeNull();
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
    });

    it('rejects relative, missing, file and recursively containing blog paths without mutation', async () => {
        const file = join(root, 'file');
        await fs.writeFile(file, 'untouched');
        for (const invalid of ['relative/blog', join(root, 'missing'), file, vault, root]) {
            expect((await service.createSafeSymlink(invalid)).success).toBe(false);
        }
        expect(await fs.readFile(file, 'utf8')).toBe('untouched');
        expect(await fs.readdir(vault)).toEqual([]);
    });

    it('never attempts symlink creation even when it would succeed', async () => {
        const symlink = jest.spyOn(fs, 'symlink');
        expect(await service.createSafeSymlink(blog)).toMatchObject({ success: true, fallback: true });
        expect((await fs.lstat(link)).isDirectory()).toBe(true);
        expect(await service.getBlogPath()).toBe(await fs.realpath(blog));
        expect(await fs.readdir(blog)).toEqual([]);
        expect(symlink).not.toHaveBeenCalled();
    });

    it('does not fall back after a concurrent creator wins the path', async () => {
        jest.spyOn(fs, 'mkdir').mockImplementationOnce(async () => {
            await fs.symlink(blog, link, 'dir');
            throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        });
        // The one-shot mock delegates the nested call to the real implementation.
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
        expect(await fs.readdir(blog)).toEqual([]);
    });

    it('preserves a concurrently created fallback path after permission failure', async () => {
        jest.spyOn(fs, 'mkdir').mockImplementationOnce(async () => {
            await fs.mkdir(link);
            await fs.writeFile(join(link, 'README.md'), 'concurrent note');
            throw Object.assign(new Error('not permitted'), { code: 'EPERM' });
        });
        expect(await service.createSafeSymlink(blog)).toMatchObject({ success: false, fallback: true });
        expect(await fs.readFile(join(link, 'README.md'), 'utf8')).toBe('concurrent note');
        await expect(fs.lstat(join(link, '.hexo-config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it('preserves an ordinary file occupying the link name', async () => {
        await fs.writeFile(link, 'not a folder');
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
        expect(await fs.readFile(link, 'utf8')).toBe('not a folder');
    });

    it('preserves a link to a different real blog and that blog README', async () => {
        const other = join(root, 'other');
        await fs.mkdir(other);
        await fs.writeFile(join(other, 'README.md'), 'other blog');
        await fs.symlink(other, link, 'dir');
        expect((await service.createSafeSymlink(blog)).success).toBe(false);
        expect(await fs.readlink(link)).toBe(other);
        expect(await fs.readFile(join(other, 'README.md'), 'utf8')).toBe('other blog');
    });

    it('refuses an unrecognized config instead of trusting its blogPath', async () => {
        await fs.mkdir(link);
        await fs.writeFile(join(link, '.hexo-config.json'), JSON.stringify({ blogPath: blog }));
        expect(await service.getBlogPath()).toBeNull();
        expect((await service.validateSymlink(blog)).isValid).toBe(false);
    });

    it('refuses fallback writes if the newly created directory is replaced by a symlink', async () => {
        const originalLstat = fs.lstat.bind(fs);
        let seenCreatedDirectory = false;
        jest.spyOn(fs, 'lstat').mockImplementation(async (file: string) => {
            const result = await originalLstat(file);
            if (file === link && result.isDirectory()) {
                if (!seenCreatedDirectory) {
                    seenCreatedDirectory = true;
                    return result;
                }
                await fs.rmdir(link);
                await fs.symlink(blog, link, 'dir');
                return originalLstat(file);
            }
            return result;
        });
        expect(await service.createSafeSymlink(blog)).toMatchObject({ success: false, fallback: true });
        expect(await fs.readdir(blog)).toEqual([]);
    });

    it('reports denied reference creation without changing source or pretending success', async () => {
        jest.spyOn(fs, 'mkdir').mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
        expect(await service.createSafeSymlink(blog)).toMatchObject({ success: false });
        expect(await fs.readdir(blog)).toEqual([]);
        expect(await fs.readdir(vault)).toEqual([]);
    });

    it('reopens a reference after service restart without exposing repository children', async () => {
        await fs.mkdir(join(blog, 'node_modules'));
        await fs.writeFile(join(blog, 'node_modules', 'private.md'), 'not indexed through vault');
        await service.createSafeSymlink(blog);
        const restarted = new SymlinkServiceV2({ vault: { adapter: { getBasePath: () => vault } } } as unknown as App);
        expect(await restarted.validateSymlink(blog)).toEqual({ isValid: true, type: 'reference', needsRecreation: false });
        expect((await restarted.createSafeSymlink(blog)).success).toBe(true);
        expect((await fs.readdir(link)).sort()).toEqual(['.hexo-config.json', 'README.md']);
        await expect(fs.lstat(join(link, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

});
