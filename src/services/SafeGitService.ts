import { promises as fs } from 'fs';
import { relative, resolve, sep } from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { assertManagedPath } from './ManagedPaths';

/** Never includes unrelated staged work; no network operations outside explicit autoPush. */
export class SafeGitService {
    private git: SimpleGit;
    constructor(private root: string, private posts: string) { this.git = simpleGit(root); }
    async commit(files: string[], message: string, push: boolean): Promise<{ committed: boolean; pushed: boolean }> {
        const paths = [...new Set(files.map(file => resolve(file)))];
        for (const file of paths) await assertManagedPath(this.posts, file, true);
        const status = await this.git.status(['--untracked-files=all']);
        // A staged file can contain intentionally partial content. Do not consume or rewrite it.
        if (status.staged.length || status.conflicted.length) throw new Error('Commit skipped: repository has staged changes or conflicts; finish those first');
        const relativePaths = paths.map(file => relative(this.root, file).split(sep).join('/'));
        const changed = new Set(status.files.map(file => file.path));
        const selected = relativePaths.filter(file => changed.has(file));
        if (!selected.length) {
            // A previous push may have failed after a successful local commit.
            if (push && status.ahead > 0) await this.git.push();
            return { committed: false, pushed: push && status.ahead > 0 };
        }
        const untracked = new Set(status.not_added);
        try {
            await this.git.raw(['--literal-pathspecs', 'add', '--', ...selected]);
            // --only prevents a concurrently staged unrelated file being included in the commit.
            await this.git.raw(['--literal-pathspecs', 'commit', '--only', '-m', message, '--', ...selected]);
        } catch (error) {
            // Restore only paths staged by this operation, never discard working-tree content.
            const tracked = selected.filter(file => !untracked.has(file));
            const added = selected.filter(file => untracked.has(file));
            if (tracked.length) await this.git.raw(['--literal-pathspecs', 'reset', '--quiet', 'HEAD', '--', ...tracked]);
            if (added.length) await this.git.raw(['--literal-pathspecs', 'rm', '--cached', '--ignore-unmatch', '--', ...added]);
            throw error;
        }
        if (push) await this.git.push();
        return { committed: true, pushed: push };
    }
    async validate(): Promise<void> {
        const top = await this.git.revparse(['--show-toplevel']);
        if (await fs.realpath(top) !== await fs.realpath(this.root)) throw new Error('Configured path must be the Git repository root');
    }
}
