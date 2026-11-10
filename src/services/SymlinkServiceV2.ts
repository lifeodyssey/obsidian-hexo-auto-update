import { App, FileSystemAdapter, Notice } from 'obsidian';
import { constants, promises as fs } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { platform } from 'os';

interface LinkResult {
    success: boolean;
    message: string;
    fallback?: boolean;
}

/** Blog links never replace, traverse for writing, or recursively delete existing paths. */
export class SymlinkServiceV2 {
    constructor(private app: App) {}

    private getTargetFolderName(): string {
        switch (platform()) {
            case 'darwin': return 'Mac Blog';
            case 'win32': return 'Win Blog';
            default: return 'Hexo Blog';
        }
    }

    private async linkPath(): Promise<string> {
        const base = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
        if (!base || !isAbsolute(base)) throw new Error('Cannot access an absolute vault path');
        const vault = await fs.realpath(base);
        if (!(await fs.stat(vault)).isDirectory()) throw new Error('Vault path is not a directory');
        return join(vault, this.getTargetFolderName());
    }

    private async sourcePath(source: string, target: string): Promise<string> {
        if (!source || !isAbsolute(source)) throw new Error('Configure an absolute Hexo blog directory');
        const canonical = await fs.realpath(source);
        if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Hexo blog path is not a directory');
        // A blog that contains the vault would make the new directory link recursive.
        const vaultRelative = relative(canonical, dirname(target));
        if (vaultRelative === '' || (!vaultRelative.startsWith(`..${sep}`) && vaultRelative !== '..' && !isAbsolute(vaultRelative))) {
            throw new Error('The blog directory must not be the vault or contain the vault');
        }
        return canonical;
    }

    /** Resolve relative symlink targets against their containing directory, not process.cwd(). */
    private async symlinkTarget(target: string): Promise<string> {
        const destination = resolve(dirname(target), await fs.readlink(target));
        const canonical = await fs.realpath(destination);
        if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Blog link is not a directory');
        return canonical;
    }

    private async referenceTarget(target: string): Promise<string | null> {
        const file = join(target, '.hexo-config.json');
        try {
            // Never accept metadata supplied through a file symlink.
            const stats = await fs.lstat(file);
            if (!stats.isFile() || stats.isSymbolicLink()) return null;
            const config = JSON.parse(await fs.readFile(file, 'utf8'));
            if (config.linkType !== 'reference' || typeof config.blogPath !== 'string' || !isAbsolute(config.blogPath)) return null;
            const canonical = await fs.realpath(config.blogPath);
            return (await fs.stat(canonical)).isDirectory() ? canonical : null;
        } catch {
            return null;
        }
    }

    async createSafeSymlink(hexoSourcePath: string): Promise<LinkResult> {
        try {
            const target = await this.linkPath();
            const source = await this.sourcePath(hexoSourcePath, target);
            // Existing paths are read-only here, including broken/misdirected symlinks and
            // old fallback directories that may now contain the user's notes.
            let existing;
            try {
                existing = await fs.lstat(target);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            if (existing) {
                if (existing.isSymbolicLink()) {
                    if (await this.symlinkTarget(target) === source) {
                        return { success: true, message: 'Existing blog link is already correct' };
                    }
                } else if (existing.isDirectory() && await this.referenceTarget(target) === source) {
                    return { success: true, fallback: true, message: 'Existing reference preserved; no files changed' };
                }
                return { success: false, message: `Existing path preserved: ${target}. Move or rename it yourself before creating a different link.` };
            }
            await fs.access(source, constants.R_OK);
            try {
                await fs.symlink(source, target, platform() === 'win32' ? 'junction' : 'dir');
                new Notice(`Blog link created at ${this.getTargetFolderName()}`);
                return { success: true, message: 'Symlink created successfully' };
            } catch (error) {
                // EEXIST can be a racing creator, not a reason to write through its path.
                if (!['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) throw error;
                return await this.createFallbackReference(source, target);
            }
        } catch (error) {
            return { success: false, message: `Blog link was not changed: ${error.message}` };
        }
    }

    private async createFallbackReference(source: string, target: string): Promise<LinkResult> {
        try {
            // Exclusive directory creation: never mkdir-recursive into an existing directory/link.
            await fs.mkdir(target);
            const created = await fs.lstat(target);
            const assertOwnedDirectory = async () => {
                const current = await fs.lstat(target);
                if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== created.dev || current.ino !== created.ino) {
                    throw new Error('Reference path changed while creating it');
                }
            };
            const config = { blogPath: source, linkType: 'reference', created: new Date().toISOString(), platform: platform() };
            await assertOwnedDirectory();
            await fs.writeFile(join(target, '.hexo-config.json'), JSON.stringify(config, null, 2), { flag: 'wx' });
            await assertOwnedDirectory();
            await fs.writeFile(join(target, 'README.md'), [
                '# Blog Reference', '',
                'This is a reference folder, not a synced copy or a symlink.', '',
                `Blog path: ${source}`, '',
                'Symlink creation was unavailable. No existing file was replaced.',
                'To replace this reference with a link, first move this folder somewhere safe yourself.'
            ].join('\n'), { flag: 'wx' });
            new Notice('Created a blog reference instead of a symlink. Existing files were not replaced.');
            return { success: true, fallback: true, message: 'Fallback reference created' };
        } catch (error) {
            // A partial reference may contain files or concurrent user edits. Never recursively clean it up.
            return { success: false, fallback: true, message: `Reference not completed; existing files preserved: ${error.message}` };
        }
    }

    async validateSymlink(hexoSourcePath: string): Promise<{
        isValid: boolean;
        type: 'symlink' | 'reference' | 'missing';
        needsRecreation: boolean;
    }> {
        let type: 'symlink' | 'reference' | 'missing' = 'missing';
        try {
            const target = await this.linkPath();
            const source = await this.sourcePath(hexoSourcePath, target);
            const stats = await fs.lstat(target);
            let destination: string | null = null;
            if (stats.isSymbolicLink()) {
                type = 'symlink';
                destination = await this.symlinkTarget(target);
            } else if (stats.isDirectory()) {
                type = 'reference';
                destination = await this.referenceTarget(target);
            }
            const isValid = destination === source;
            return { isValid, type, needsRecreation: !isValid };
        } catch {
            return { isValid: false, type, needsRecreation: true };
        }
    }

    async getBlogPath(): Promise<string | null> {
        try {
            const target = await this.linkPath();
            const stats = await fs.lstat(target);
            const source = stats.isSymbolicLink() ? await this.symlinkTarget(target)
                : stats.isDirectory() ? await this.referenceTarget(target) : null;
            return source ? await this.sourcePath(source, target) : null;
        } catch {
            return null;
        }
    }
}
