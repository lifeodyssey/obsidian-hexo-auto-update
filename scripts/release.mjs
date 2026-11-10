import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const execute = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** main is the trust root. This cannot prove human review or replace branch/tag protection. */
export function verifyRequest(repository, tag, sha, trustedSha, run = execute) {
    if (!versionPattern.test(tag) || !/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{40}$/.test(trustedSha)) throw new Error('Invalid immutable release request');
    run('git', ['merge-base', '--is-ancestor', sha, trustedSha]);
    verifyTag(repository, tag, sha, run);
}

export function verifyAssets(release, assets) {
    if (release.assets.length !== assets.length || new Set(release.assets.map(item => item.name)).size !== assets.length) throw new Error('Unexpected or duplicate release assets');
    for (const asset of assets) {
        const existing = release.assets.find(item => item.name === asset.name);
        if (!existing || existing.size !== asset.size || existing.digest !== asset.digest) throw new Error(`Missing or changed release asset: ${asset.name}`);
    }
}

/** Validate explicit version-tag intent and the committed compatibility/channel metadata. */
export function releasePlan(pkg, manifest, config, versions, tag) {
    if (!versionPattern.test(pkg.version) || tag !== pkg.version) throw new Error('Release tag must equal the numeric x.y.z package version');
    if (pkg.version !== manifest.version) throw new Error('Package and manifest versions differ');
    if (!manifest.minAppVersion || versions[pkg.version] !== manifest.minAppVersion) throw new Error('Missing or mismatched versions.json compatibility entry');
    if (config.version !== pkg.version || !['prerelease', 'stable'].includes(config.channel)) throw new Error('Explicit version and channel are required');
    if (config.notes !== `release-notes/${pkg.version}.md`) throw new Error('Version-specific release notes are required');
    return { version: pkg.version, channel: config.channel };
}

/** Resolve a pre-existing immutable tag to a commit; never create or move tags. */
export function verifyTag(repository, version, sha, run = execute) {
    const lines = run('git', ['ls-remote', `https://github.com/${repository}.git`, `refs/tags/${version}`, `refs/tags/${version}^{}`])
        .split('\n').filter(Boolean).map(line => line.split(/\s+/));
    const tag = lines.find(line => line[1]?.endsWith('^{}')) || lines.find(line => line[1] === `refs/tags/${version}`);
    if (!tag || tag[0] !== sha) throw new Error('Release tag missing or points to a different commit');
}

/** Fail closed on draft target/channel conflicts; target_commitish is not a reliable immutable SHA. */
export function verifyRelease(release, repository, version, channel, sha, run = execute) {
    if (release.tag_name !== version) throw new Error('Release tag mismatch');
    if (release.prerelease !== (channel === 'prerelease')) throw new Error('Existing release has a different channel');
    // Reject mutable branches even when they currently resolve to the intended commit.
    // For published releases the immutable tag is authoritative; drafts must also match their proposed target.
    if (release.draft) {
        if (release.target_commitish !== sha) throw new Error('Draft target must equal the expected immutable commit SHA');
    }
    verifyTag(repository, version, sha, run);
}

/** Publish verified build artifacts, resuming matching drafts without replacing published assets. */
export function publish({ repository, version, channel, sha, assets, notes }, run = execute) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !versionPattern.test(version) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid release inputs');
    if (!['prerelease', 'stable'].includes(channel)) throw new Error('Release channel is required');
    verifyTag(repository, version, sha, run);
    const endpoint = `repos/${repository}/releases/tags/${version}`;
    let release;
    try { release = JSON.parse(run('gh', ['api', endpoint])); }
    catch (error) {
        if (!String(error.stderr || '').includes('(HTTP 404)')) throw error;
        run('gh', ['release', 'create', version, '--repo', repository, '--verify-tag', '--target', sha,
            '--title', `v${version}${channel === 'prerelease' ? ' preview' : ''}`, '--notes-file', notes,
            '--draft', ...(channel === 'prerelease' ? ['--prerelease'] : [])]);
        release = JSON.parse(run('gh', ['api', endpoint]));
    }
    verifyRelease(release, repository, version, channel, sha, run);
    const upload = assets.filter(asset => {
        if (release.draft) return true;
        const existing = release.assets.find(item => item.name === asset.name);
        if (!existing) return true;
        if (existing.size !== asset.size || existing.digest !== asset.digest) throw new Error(`Published asset differs or has no verifiable digest: ${asset.name}`);
        return false;
    });
    if (upload.length) {
        verifyTag(repository, version, sha, run);
        run('gh', ['release', 'upload', version, '--repo', repository, ...upload.map(asset => asset.path), ...(release.draft ? ['--clobber'] : [])]);
    }
    if (release.draft) {
        // Re-read after uploading: another actor may have changed the draft while this job was running.
        release = JSON.parse(run('gh', ['api', endpoint]));
        verifyRelease(release, repository, version, channel, sha, run);
        if (!release.draft) throw new Error('Draft was published concurrently; inspect assets before retry');
        verifyAssets(release, assets);
        run('gh', ['release', 'edit', version, '--repo', repository, '--draft=false', `--prerelease=${channel === 'prerelease'}`, ...(channel === 'prerelease' ? ['--latest=false'] : [])]);
    }
    // Detection only: the Releases API has no documented compare-and-swap publication.
    const published = JSON.parse(run('gh', ['api', endpoint]));
    verifyRelease(published, repository, version, channel, sha, run);
    verifyAssets(published, assets);
    if (published.draft) throw new Error('Release remains a draft');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv[2] === 'request') {
        verifyRequest(process.env.GITHUB_REPOSITORY, process.env.RELEASE_TAG, process.env.RELEASE_SHA, process.env.TRUSTED_SHA);
        process.exit(0);
    }
    const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
    const pkg = readJson('package.json');
    const config = readJson('release-config.json');
    const plan = releasePlan(pkg, readJson('manifest.json'), config, readJson('versions.json'), process.env.RELEASE_TAG);
    const notes = readFileSync(config.notes, 'utf8');
    if (!notes.startsWith(`<!-- release:${plan.version} channel:${plan.channel} -->`)) throw new Error('Release notes channel/version mismatch');
    if (process.argv[2] === 'plan') {
        appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    } else if (process.argv[2] === 'publish') {
        const assets = ['dist/main.js', 'manifest.json', 'styles.css'].map(path => {
            const bytes = readFileSync(path);
            return { path, name: path.split('/').pop(), size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
        });
        publish({ repository: process.env.GITHUB_REPOSITORY, ...plan, sha: execute('git', ['rev-parse', 'HEAD']), assets, notes: config.notes });
    } else throw new Error('Expected plan or publish');
}
