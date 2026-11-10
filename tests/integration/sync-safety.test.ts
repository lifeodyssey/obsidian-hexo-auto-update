import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit } from 'simple-git';
import { FrontMatterProcessorV2 } from '../../src/services/FrontMatterProcessorV2';
import { FileScannerV2 } from '../../src/services/FileScannerV2';
import { SafeGitService } from '../../src/services/SafeGitService';
import { assertManagedPath } from '../../src/services/ManagedPaths';

let root: string;
let posts: string;
const content = '---\ntitle: Existing\ndate: 2020-01-01\n---\nBody\n';
beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'hexo-safety-'));
    posts = join(root, 'source', '_posts');
    await fs.mkdir(posts, { recursive: true });
    const git = simpleGit(root);
    await git.init();
    await git.addConfig('user.name', 'Fixture');
    await git.addConfig('user.email', 'fixture@example.invalid');
    await fs.writeFile(join(root, 'README.md'), 'Keep me');
    await fs.writeFile(join(posts, 'clean.md'), content);
    await git.add('.'); await git.commit('initial');
});
afterEach(async () => { jest.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

test('front-matter rejects PNG, invalid UTF8, NUL and symbolic/hard links without changing bytes', async () => {
    const processor = new FrontMatterProcessorV2();
    for (const [name, bytes] of [['image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])], ['bad.md', Buffer.from([0xff, 0xfe])], ['nul.md', Buffer.from([0x41, 0, 0x42])]] as const) {
        const file = join(posts, name); await fs.writeFile(file, bytes);
        expect((await processor.processFile(file)).success).toBe(false);
        expect(await fs.readFile(file)).toEqual(bytes);
    }
    const target = join(posts, 'target.md'); await fs.writeFile(target, '# unchanged');
    const link = join(posts, 'link.md'); await fs.symlink(target, link);
    expect((await processor.processFile(link)).success).toBe(false);
    await fs.unlink(link); await fs.link(target, link);
    expect((await processor.processFile(link)).success).toBe(false);
    expect(await fs.readFile(target, 'utf8')).toBe('# unchanged');
});
test('existing front-matter and timezone-sensitive dates remain byte-identical', async () => {
    const file = join(posts, 'clean.md'); const bytes = await fs.readFile(file);
    expect((await new FrontMatterProcessorV2().processFile(file)).modified).toBe(false);
    expect(await fs.readFile(file)).toEqual(bytes);
});
test('fills missing date/title and is idempotent on the second pass', async () => {
    const file = join(posts, 'new-post.md'); await fs.writeFile(file, '# Body\n');
    const processor = new FrontMatterProcessorV2();
    expect((await processor.processFile(file)).success).toBe(true);
    const first = await fs.readFile(file, 'utf8');
    expect(first).toContain('title: New Post'); expect(first).toContain('# Body');
    expect((await processor.processFile(file)).modified).toBe(false);
    expect(await fs.readFile(file, 'utf8')).toBe(first);
});
test('executable front-matter engines and invalid YAML fail without writes', async () => {
    const processor = new FrontMatterProcessorV2();
    for (const text of ['---js\n({title: "oops"})\n---\nbody', '---\nx: [unclosed\n---\nbody']) {
        const file = join(posts, 'unsafe.md'); await fs.writeFile(file, text);
        expect((await processor.processFile(file)).success).toBe(false);
        expect(await fs.readFile(file, 'utf8')).toBe(text);
    }
});
test('concurrent editor change is not overwritten and temp output is removed', async () => {
    const file = join(posts, 'edit.md'); await fs.writeFile(file, '# first');
    const processor = new FrontMatterProcessorV2();
    const original = processor.processContent.bind(processor);
    jest.spyOn(processor, 'processContent').mockImplementation(async (...args) => {
        const result = await original(...args); await fs.writeFile(file, '# newer edit'); return result;
    });
    expect((await processor.processFile(file)).success).toBe(false);
    expect(await fs.readFile(file, 'utf8')).toBe('# newer edit');
    expect((await fs.readdir(posts)).some(file => file.endsWith('.tmp'))).toBe(false);
});
test('scanner differentiates clean, untracked, modified, deleted and prefix-neighbour paths', async () => {
    const scanner = new FileScannerV2(root);
    expect((await scanner.comprehensiveScan()).newFiles).toEqual([]);
    const fresh = join(posts, 'new.md'); await fs.writeFile(fresh, '# new');
    const old = join(posts, 'clean.md'); await fs.writeFile(old, content + 'changed');
    await fs.mkdir(join(root, 'source', '_posts-private')); await fs.writeFile(join(root, 'source', '_posts-private', 'secret.md'), 'secret');
    const scan = await scanner.comprehensiveScan();
    expect(scan.newFiles).toEqual([fresh]); expect(scan.modifiedFiles).toEqual([old]);
    expect(scan.gitFiles.untracked).toEqual([fresh]);
    await fs.unlink(old);
    expect((await scanner.comprehensiveScan()).deletedFiles).toEqual([old]);
});
test('scanner reports missing date/title, handles CRLF and does not classify clean files as new', async () => {
    const file = join(posts, 'partial.md'); await fs.writeFile(file, '---\r\ntags: one\r\n---\r\nbody');
    const result = await new FileScannerV2(root).findFilesNeedingAttention();
    expect(result.missingDate).toContain(file); expect(result.missingTitle).toContain(file);
    expect(result.missingFrontMatter).not.toContain(file);
});
test('missing repository/scan and symlink escapes fail rather than returning empty success', async () => {
    await expect(new FileScannerV2(root).comprehensiveScan('../elsewhere')).rejects.toThrow();
    await expect(new FileScannerV2(root).comprehensiveScan('missing')).rejects.toThrow();
    const outside = join(root, 'README.md');
    const link = join(posts, 'escape.md'); await fs.symlink(outside, link);
    await expect(assertManagedPath(posts, link)).rejects.toThrow();
    await expect(assertManagedPath(posts, join(root, 'source', '_posts-private', 'x.md'), true)).rejects.toThrow();
});
test('safe commit preserves unrelated staged work and refuses to absorb it', async () => {
    const git = simpleGit(root); const file = join(posts, 'clean.md');
    await fs.writeFile(join(root, 'README.md'), 'staged user change'); await git.add('README.md');
    const index = await git.diff(['--cached']); await fs.writeFile(file, content + 'new');
    await expect(new SafeGitService(root, posts).commit([file], 'plugin', false)).rejects.toThrow(/staged/);
    expect(await git.diff(['--cached'])).toBe(index);
    expect((await git.log()).latest?.message).toBe('initial');
});
test('safe commit includes new files/deletions but never outside managed posts', async () => {
    const git = simpleGit(root); const service = new SafeGitService(root, posts); await service.validate();
    const old = join(posts, 'clean.md'); const file = join(posts, '-new.md');
    await fs.unlink(old); await fs.writeFile(file, '# new');
    await fs.writeFile(join(root, 'README.md'), 'unstaged user change');
    await service.commit([file, old], 'plugin', false);
    const changes = await git.diff(['HEAD^', 'HEAD', '--name-only']);
    expect(changes).toContain('source/_posts/-new.md'); expect(changes).toContain('source/_posts/clean.md');
    expect(changes).not.toContain('README.md');
    expect((await git.status()).modified).toContain('README.md');
    await expect(service.commit([join(root, 'README.md')], 'unsafe', false)).rejects.toThrow(/outside/);
});
test('failed commit restores plugin staging without deleting working files', async () => {
    const git = simpleGit(root); const file = join(posts, 'new.md'); await fs.writeFile(file, '# keep');
    const service = new SafeGitService(root, posts);
    const client = (service as unknown as { git: ReturnType<typeof simpleGit> }).git;
    const raw = client.raw.bind(client);
    jest.spyOn(client, 'raw').mockImplementation(((args: string[]) => args.includes('commit') ? Promise.reject(new Error('simulated commit failure')) : raw(args)) as typeof client.raw);
    await expect(service.commit([file], 'fail', false)).rejects.toThrow('simulated commit failure');
    expect((await git.status()).staged).toEqual([]); expect(await fs.readFile(file, 'utf8')).toBe('# keep');
});
