# Obsidian–Hexo Auto Updater

Desktop Obsidian plugin that watches a local Hexo `source/_posts` directory, fills missing Markdown front matter, and optionally commits or pushes changes with Git.

**Development status:** 2.0.1 is a prerelease. The safety changes on this branch have automated filesystem/Git tests, but are not yet validated inside a real Obsidian desktop installation. Do not treat CI as proof that your vault, operating system, or Git setup is compatible. Back up your vault and blog and try a disposable copy first.

[Releases](https://github.com/lifeodyssey/obsidian-hexo-auto-update/releases) · [Issues](https://github.com/lifeodyssey/obsidian-hexo-auto-update/issues)

## Requirements and setup

- Desktop Obsidian; mobile is not supported. The manifest minimum is 0.15.0, but this is not a tested compatibility guarantee for every installer. Obsidian's embedded Node/Electron version depends on its installer, not just the app update.
- Git installed and a local Hexo Git repository with `source/_posts` already present.
- Configure **Hexo source path** as the absolute repository root, not `_posts` itself.
- Git identity and, for optional pushes, a working remote/upstream and authentication must be configured outside this plugin.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the same release into `<vault>/.obsidian/plugins/hexo-auto-updater/`, reload Obsidian, and enable the plugin. Check the actual `id` in `manifest.json` if using a development build.

## Behavior and safety boundaries

- Auto-sync watches posts and assets. Markdown (`.md` / `.markdown`) is eligible for front-matter processing; binary assets are never parsed as Markdown.
- Existing front-matter values are preserved. Date/title are added only when missing and their settings are enabled. Invalid YAML or unsafe/non-text files stop that sync operation rather than being silently committed.
- Automatic startup/manual scans process new or modified posts, not every clean post. **Process All Posts Front-Matter** is an explicit command that can update clean posts too.
- Changes and deletions under `_posts` can be committed. Unrelated README/config edits are not included. If any user changes are already staged or conflicted, automatic commits stop so partial staging is not consumed.
- Auto-push is off by default. A failed push is reported; a later sync retries when Git reports local commits ahead of the upstream. There is no background exponential-backoff retry service.
- Writes use an exclusive temporary file and rename, with a check for intervening edits. This is not a filesystem lock or a guarantee against every external-editor race or power failure.
- Existing real files/directories or conflicting links at the vault's blog-link location are **not deleted or replaced**. Resolve conflicts manually after backing up. A permission-related symlink fallback is not a live copy of all blog content.
- Plugin operations are serialized. External Git commands and other programs are not controlled by this queue.

Defaults enable auto-sync and auto-commit, but not auto-push. For the first trial, disable auto-commit and use a disposable repository.

## Commands

- Sync Now
- Toggle Auto-Sync
- Process All Posts Front-Matter
- Show Plugin Statistics
- Recreate Blog Link

Statistics are session counters, not a complete audit log. Sync errors appear as notices and in the developer console.

## Development and verification

Use Node 24 for the development toolchain, then:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Tests include real temporary filesystem and local Git repository fixtures plus mocked Obsidian/Electron APIs. They do not execute inside the real host or test a live vault. Coverage percentages describe the files exercised by the tests, not every shipped feature. No measured CPU reduction, universal compatibility, or production reliability percentage is claimed.

The runtime retains Chokidar 4 rather than requiring new Node `fs.glob` APIs or Chokidar 6. Updating the build machine's Node does not update Obsidian's embedded runtime. The current development dependency audit has a low-severity transitive `deepmerge` advisory with no patched latest release at the time checked; the production-only audit is separate.

## Release process

A version bump must also select an explicit matching version and channel in `release-config.json`. CI tests and builds before publication. Releases are initially drafts until all three assets upload; retries validate existing tags/assets rather than silently overwriting published content. Follow-up commits without a version change do not republish an existing release.

Before releasing functional changes, validate installation, editing, assets, deletion, settings changes, shutdown, and Git failures in a **disposable real Obsidian vault**, including the operating systems to be supported. Never use your only copy of notes for this test.

## License

[MIT](LICENSE)
