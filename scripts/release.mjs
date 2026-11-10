import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const execute = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function releasePlan(pkg, manifest, config, previous) {
    if (pkg.version !== manifest.version) throw new Error('Package and manifest versions differ');
    const changed = previous === null || pkg.version !== previous.version;
    if (!changed) return { version: pkg.version, changed: false };
    if (config.version !== pkg.version || !['prerelease', 'stable'].includes(config.channel)) {
        throw new Error('Set release-config.json to this version and explicitly choose prerelease or stable');
    }
    return { version: pkg.version, changed: true, channel: config.channel };
}

export function versionBeforePush(before, run = execute) {
    if (!/^[0-9a-f]{40}$/.test(before)) throw new Error('Missing or invalid push base SHA');
    return /^0+$/.test(before) ? null : JSON.parse(run('git', ['show', `${before}:package.json`]));
}

export function publish({ repository, version, channel, sha, assets, notes }, run = execute) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) || !/^[0-9a-f]{40}$/.test(sha)) {
        throw new Error('Invalid release inputs');
    }
    if (!['prerelease', 'stable'].includes(channel)) throw new Error('Release channel is required');
    const refs = run('git', ['ls-remote', 'origin', `refs/tags/${version}`, `refs/tags/${version}^{}`]);
    const lines = refs.split('\n').filter(Boolean).map(line => line.split(/\s+/));
    const tag = lines.find(line => line[1].endsWith('^{}')) || lines[0];
    if (tag && tag[0] !== sha) throw new Error('Existing tag points to a different commit; refusing to replace it');

    let release;
    try {
        release = JSON.parse(run('gh', ['api', `repos/${repository}/releases/tags/${version}`]));
    } catch (error) {
        // Network, authorization and rate-limit errors are not evidence of an absent release.
        if (!String(error.stderr || '').includes('(HTTP 404)')) throw error;
        run('gh', ['release', 'create', version, '--repo', repository, '--target', sha,
            '--title', `v${version}${channel === 'prerelease' ? ' security preview' : ''}`,
            '--notes-file', notes, '--draft', ...(channel === 'prerelease' ? ['--prerelease'] : [])]);
        release = { draft: true, assets: [] };
    }
    if (!release.draft && release.prerelease !== (channel === 'prerelease')) {
        throw new Error('Existing published release has a different channel; refusing to change it');
    }
    const upload = assets.filter(asset => {
        if (release.draft) return true;
        const existing = release.assets.find(item => item.name === asset.name);
        if (!existing) return true;
        if (existing.size !== asset.size || existing.digest !== asset.digest) {
            throw new Error(`Published asset differs or has no verifiable digest: ${asset.name}`);
        }
        return false;
    });
    if (upload.length) {
        run('gh', ['release', 'upload', version, '--repo', repository,
            ...upload.map(asset => asset.path), ...(release.draft ? ['--clobber'] : [])]);
    }
    if (release.draft) {
        run('gh', ['release', 'edit', version, '--repo', repository, '--draft=false',
            `--prerelease=${channel === 'prerelease'}`, ...(channel === 'prerelease' ? ['--latest=false'] : [])]);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
    const pkg = readJson('package.json');
    const config = readJson('release-config.json');
    if (process.argv[2] === 'plan') {
        const plan = releasePlan(pkg, readJson('manifest.json'), config, versionBeforePush(process.env.BEFORE_SHA));
        appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    } else if (process.argv[2] === 'publish') {
        const assets = ['dist/main.js', 'manifest.json', 'styles.css'].map(path => {
            const bytes = readFileSync(path);
            return { path, name: path.split('/').pop(), size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
        });
        if (config.version !== pkg.version) throw new Error('Release config version mismatch');
        publish({ repository: process.env.GITHUB_REPOSITORY, version: pkg.version, channel: config.channel,
            sha: process.env.GITHUB_SHA, assets, notes: 'SECURITY_DEPENDENCIES.md' });
    } else {
        throw new Error('Expected plan or publish');
    }
}
