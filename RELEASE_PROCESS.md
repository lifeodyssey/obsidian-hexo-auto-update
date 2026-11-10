# Explicit release process

Merging a PR or changing `main` does not publish anything. Publication is requested by pushing a new numeric version tag matching the committed package and manifest version (`x.y.z`, without `v`, prerelease suffix or SemVer build metadata). The release channel is separately and explicitly configured.

Before requesting a release:
1. Validate the exact commit, including host-level QA and all data-safety work. Never tag unreviewed changes.
2. Update package.json, manifest.json, and versions.json with the same version and matching minimum Obsidian version.
3. Set release-config.json to that version, a `stable` or `prerelease` channel, and `release-notes/<version>.md`.
4. Start the notes with `<!-- release:<version> channel:<channel> -->` and describe the scope and outstanding limitations of that version. Do not reuse security-preview notes for a stable release.
5. Create and push a new immutable version tag on that exact validated commit. No tag was created as part of this workflow fix.

Each tag has its own concurrency group. A later ordinary branch push cannot replace a pending version release. Rerun a failed workflow for the same unchanged tag rather than moving it. Never force-move release tags. Draft releases must match both the intended channel and target commit; conflicting drafts/tags stop publication. Published assets are never overwritten.

The helper checks remote tag identity before upload and before draft publication, and re-reads the draft after upload. GitHub does not provide a transaction spanning tag mutation, uploads, and release publication; these checks do not promise protection against a privileged actor concurrently changing a tag at precisely the final API boundary. Repository tag protection is recommended, but not automatically configured here.

Existing 2.0.1 is unchanged. This PR neither republishes it nor releases PR #6. Published historical releases may have `target_commitish: main`; their immutable tag is authoritative. Existing drafts must additionally resolve their target to the expected commit.
