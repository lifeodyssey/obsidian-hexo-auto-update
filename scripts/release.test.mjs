import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releasePlan, versionBeforePush, publish } from './release.mjs';

const sha = 'a'.repeat(40);
const options = { repository: 'owner/repo', version: '2.0.1', channel: 'prerelease', sha,
    notes: 'notes.md', assets: [{ path: 'dist/main.js', name: 'main.js', size: 2, digest: 'sha256:test' }] };
function fake(release, refs = `${sha}\trefs/tags/2.0.1`) {
    const calls = [];
    const run = (cmd, args) => {
        calls.push([cmd, ...args]);
        if (cmd === 'git') return refs;
        if (args[0] === 'api') {
            if (release instanceof Error) throw release;
            return JSON.stringify(release);
        }
        return '';
    };
    return { run, calls };
}
const notFound = () => Object.assign(new Error('not found'), { stderr: 'gh: Not Found (HTTP 404)' });

test('version-bump plus follow-up commit compares against the push base, not HEAD^', () => {
    const before = 'b'.repeat(40);
    const previous = versionBeforePush(before, (cmd, args) => {
        assert.deepEqual([cmd, ...args], ['git', 'show', `${before}:package.json`]);
        return '{"version":"2.0.0"}';
    });
    assert.equal(releasePlan({ version: '2.0.1' }, { version: '2.0.1' }, { version: '2.0.1', channel: 'prerelease' }, previous).changed, true);
});
test('no version bump is a no-op; current follow-up cannot republish 2.0.1', () => {
    assert.equal(releasePlan({ version: '2.0.1' }, { version: '2.0.1' }, {}, { version: '2.0.1' }).changed, false);
});
test('initial push and invalid/missing base are handled explicitly', () => {
    assert.equal(versionBeforePush('0'.repeat(40)), null);
    assert.throws(() => versionBeforePush(undefined), /invalid/);
});
test('new versions must explicitly choose their own channel', () => {
    assert.throws(() => releasePlan({ version: '2.0.2' }, { version: '2.0.2' }, { version: '2.0.1', channel: 'prerelease' }, { version: '2.0.1' }), /explicitly/);
    assert.equal(releasePlan({ version: '2.0.2' }, { version: '2.0.2' }, { version: '2.0.2', channel: 'stable' }, { version: '2.0.1' }).channel, 'stable');
});
test('fresh release is draft until all assets upload, then published as configured', () => {
    const f = fake(notFound(), '');
    publish(options, f.run);
    const actions = f.calls.filter(c => c[0] === 'gh').map(c => c[2]);
    assert.deepEqual(actions, ['repos/owner/repo/releases/tags/2.0.1', 'create', 'upload', 'edit']);
    assert.ok(f.calls.find(c => c[2] === 'create').includes('--draft'));
    assert.ok(f.calls.find(c => c[2] === 'edit').includes('--prerelease=true'));
});
test('partial draft is resumed without creating another release', () => {
    const f = fake({ draft: true, assets: [] });
    publish(options, f.run);
    assert.ok(!f.calls.some(c => c[2] === 'create'));
    assert.ok(f.calls.find(c => c[2] === 'upload').includes('--clobber'));
});
test('fully published identical release is an idempotent no-op', () => {
    const f = fake({ draft: false, prerelease: true, assets: options.assets });
    publish(options, f.run);
    assert.equal(f.calls.filter(c => c[0] === 'gh').length, 1);
});
test('partial published release uploads only missing assets, never overwrites', () => {
    const f = fake({ draft: false, prerelease: true, assets: [] });
    publish(options, f.run);
    const upload = f.calls.find(c => c[2] === 'upload');
    assert.ok(upload.includes('dist/main.js'));
    assert.ok(!upload.includes('--clobber'));
    assert.ok(!f.calls.some(c => c[2] === 'edit'));
});
test('tag collision, channel mismatch and changed published assets fail closed', () => {
    assert.throws(() => publish(options, fake({}, `${'b'.repeat(40)}\trefs/tags/2.0.1`).run), /different commit/);
    assert.throws(() => publish(options, fake({ draft: false, prerelease: false, assets: [] }).run), /different channel/);
    assert.throws(() => publish(options, fake({ draft: false, prerelease: true, assets: [{ name: 'main.js', size: 3 }] }).run), /Published asset differs/);
});
test('HTTP 403/network failures do not cause create attempts', () => {
    const f = fake(Object.assign(new Error('forbidden'), { stderr: 'gh: Forbidden (HTTP 403)' }));
    assert.throws(() => publish(options, f.run), /forbidden/);
    assert.ok(!f.calls.some(c => c[2] === 'create'));
});
test('stable configuration is supported without modifying any existing release', () => {
    const f = fake(notFound(), '');
    publish({ ...options, channel: 'stable' }, f.run);
    assert.ok(!f.calls.find(c => c[2] === 'create').includes('--prerelease'));
    assert.ok(f.calls.find(c => c[2] === 'edit').includes('--prerelease=false'));
});
test('failed upload never publishes a draft', () => {
    const f = fake({ draft: true, assets: [] });
    assert.throws(() => publish(options, (cmd, args) => {
        if (args[1] === 'upload') throw new Error('upload failed');
        return f.run(cmd, args);
    }), /upload failed/);
    assert.ok(!f.calls.some(c => c[2] === 'edit'));
});
