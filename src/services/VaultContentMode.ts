import { promises as fs } from 'fs';
import path from 'path';
import { isInside, isMarkdown } from './ManagedPaths';

export interface VaultContentConfig {
    vaultRoot: string;
    contentRoot: string;
    gitRoot: string;
    hexoRoot?: string;
}

export interface ValidatedVaultContent {
    vaultRoot: string;
    contentRoot: string;
    gitRoot: string;
    postsRoot: string;
}

async function existingDirectory(value: string, label: string): Promise<string> {
    if (!value || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute existing directory`);
    const resolved = path.resolve(value);
    if (!(await fs.lstat(resolved)).isDirectory()) throw new Error(`${label} must be a real directory, not a symbolic link`);
    return resolved;
}

async function collectPublicFiles(contentRoot: string): Promise<string[]> {
    const files: string[] = [];
    async function walk(directory: string): Promise<void> {
        for (const item of await fs.readdir(directory, { withFileTypes: true })) {
            const full = path.join(directory, item.name);
            // Repository metadata is not content; do not traverse it (worktrees can use a .git file).
            if (directory === contentRoot && ['.git', '.gitignore', '.gitattributes'].includes(item.name)) continue;
            const stat = await fs.lstat(full);
            if (stat.isSymbolicLink()) throw new Error(`Public content contains a symbolic link: ${full}`);
            if (item.name.startsWith('.')) throw new Error(`Hidden files are not accepted in public content: ${full}`);
            if (stat.isDirectory()) await walk(full);
            else if (stat.isFile()) {
                if (stat.nlink > 1) throw new Error(`Hard-linked content is not accepted: ${full}`);
                files.push(full);
            } else throw new Error(`Unsupported content entry: ${full}`);
        }
    }
    await walk(contentRoot);
    return files;
}

/** Explicitly opt-in, narrow content scope. Never infer the whole vault as a publishing root. */
export async function validateVaultContent(config: VaultContentConfig): Promise<ValidatedVaultContent> {
    const vaultRoot = await existingDirectory(config.vaultRoot, 'Vault root');
    const contentRoot = await existingDirectory(config.contentRoot, 'Public content root');
    const gitRoot = await existingDirectory(config.gitRoot, 'Content Git root');
    if (!isInside(vaultRoot, contentRoot)) throw new Error('Public content must be a dedicated directory inside the vault, not the vault itself');
    if (gitRoot !== contentRoot) throw new Error('This mode requires the content Git root to equal the public content root; never use the private vault Git root');
    // Validate every ancestor inside the vault, not just the final directory.
    let candidate = contentRoot;
    while (candidate !== vaultRoot) {
        if ((await fs.lstat(candidate)).isSymbolicLink()) throw new Error('Public content path cannot contain symbolic links');
        candidate = path.dirname(candidate);
    }
    const realVault = await fs.realpath(vaultRoot);
    if (!isInside(realVault, await fs.realpath(contentRoot))) throw new Error('Public content resolves outside the vault');
    const postsRoot = path.join(contentRoot, '_posts');
    await existingDirectory(postsRoot, 'Public _posts directory');
    await collectPublicFiles(contentRoot);
    return { vaultRoot, contentRoot, gitRoot, postsRoot };
}

/**
 * Conservative compatibility gate, not a general Markdown security parser.
 * Wiki syntax is deliberately unsupported until a scoped resolver is implemented.
 * This does not provide an OS sandbox or an atomic snapshot against concurrent writes.
 */
export async function preflightVaultContent(config: VaultContentConfig): Promise<{ files: string[]; markdownFiles: string[] }> {
    const roots = await validateVaultContent(config);
    const files = await collectPublicFiles(roots.contentRoot);
    const markdownFiles = files.filter(isMarkdown);
    if (!markdownFiles.some(file => isInside(roots.postsRoot, file))) throw new Error('Public content has no Markdown posts; refusing an empty build or sync');
    for (const file of markdownFiles) {
        const text = await fs.readFile(file, 'utf8');
        if (text.includes('\0') || text.includes('\uFFFD')) throw new Error(`Invalid text in Markdown: ${file}`);
        if (/!?\[\[/.test(text)) throw new Error(`Obsidian wiki links/embeds are not supported for publishing yet: ${file}. Use public Markdown links instead.`);
        // Decode once/twice to reject common encoded local traversal as well as literal forms.
        let inspected = text;
        for (let pass = 0; pass < 2; pass++) {
            try { inspected = decodeURIComponent(inspected); } catch { break; }
        }
        if (/(?:file:|\.\.[\\/]|[a-z]:\\)/i.test(inspected)) throw new Error(`Potential local/private path reference in ${file}; review and replace it before publishing`);
    }
    return { files: files.sort(), markdownFiles: markdownFiles.sort() };
}

/** Explicit setup action only: creates engine/content -> public source. Never links an engine into the vault. */
export async function prepareReverseContentLink(config: VaultContentConfig): Promise<{ linkPath: string; created: boolean }> {
    const roots = await validateVaultContent(config);
    await preflightVaultContent(config);
    const engine = await existingDirectory(config.hexoRoot || '', 'Hexo engine root');
    const realEngine = await fs.realpath(engine);
    const realVault = await fs.realpath(roots.vaultRoot);
    if (realEngine === realVault || isInside(realVault, realEngine) || isInside(realEngine, realVault)) {
        throw new Error('Hexo engine must be separate from the vault, neither inside it nor containing it');
    }
    const linkPath = path.join(engine, 'content');
    let exists = false;
    let isLink = false;
    try {
        const current = await fs.lstat(linkPath);
        exists = true;
        isLink = current.isSymbolicLink();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (exists) {
        let sameTarget = false;
        if (isLink) {
            try { sameTarget = await fs.realpath(linkPath) === await fs.realpath(roots.contentRoot); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (sameTarget) return { linkPath, created: false };
        throw new Error(`Refusing to overwrite existing content path (including broken links): ${linkPath}`);
    }
    // EEXIST is intentionally propagated if another process creates the path meanwhile.
    await fs.symlink(roots.contentRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    return { linkPath, created: true };
}
