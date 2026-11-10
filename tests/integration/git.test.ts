import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { simpleGit } from 'simple-git';

describe('patched simple-git compatibility', () => {
    it('supports the plugin status, add, commit and push flow without a network remote', async () => {
        const root = mkdtempSync(join(tmpdir(), 'hexo-security-'));
        try {
            const repo = join(root, 'repo');
            const remote = join(root, 'remote.git');
            const { mkdirSync } = await import('fs');
            mkdirSync(repo);
            mkdirSync(remote);
            await simpleGit(remote).init(true);
            const git = simpleGit(repo);
            await git.init();
            await git.addConfig('user.name', 'Security regression test');
            await git.addConfig('user.email', 'test@example.invalid');
            expect(await git.checkIsRepo()).toBe(true);
            writeFileSync(join(repo, 'post.md'), '# local fixture\n');
            await git.add(['post.md']);
            expect((await git.status()).staged).toContain('post.md');
            await git.commit('local fixture');
            await git.addRemote('origin', remote);
            await git.push('origin', 'HEAD:main');
            expect((await git.status()).isClean()).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
