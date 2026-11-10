# Explicit release process and trust boundary

Neither a PR merge nor a tag push publishes anything. A maintainer deliberately runs **Release reviewed Obsidian plugin** using **main**, supplying an existing numeric `x.y.z` tag and the expected full 40-character commit SHA. Both values are mandatory. No tag or release is created by merging this change.

1. Review and test the exact release commit, including actual Obsidian QA. It must be in main history.
2. Match package.json, manifest.json and versions.json; commit explicit release-config.json version/channel and version-specific notes. Start notes with `<!-- release:<version> channel:<channel> -->`.
3. Create a new immutable tag on that reviewed commit. Never reuse, delete or force-move release tags. Record its SHA.
4. Dispatch from main with both tag and SHA. The workflow compares the tag to that SHA and requires it to be an ancestor of the main commit that defines the workflow. Re-run that same unchanged request on failure.

## Least privilege

The build job has read-only contents permission and all checkouts disable persisted credentials. It may execute the reviewed release's dependency/build scripts. The separate publisher installs no dependencies and executes no tag-provided program. It runs the helper from the pinned main workflow commit, checks out the release commit only as data, and downloads this run's build artifact. Write permission is scoped to the publisher job.

Main is the trust root, **not proof of human review**. This workflow cannot defend against a maintainer who can replace the workflow itself or bypass repository governance. Protect main/release tags and restrict workflow edits and dispatch access. Those repository security settings have not been changed automatically. Tags are checked at each critical boundary; a tag moved before dispatch is rejected if it differs from the explicitly supplied expected SHA. There is no tag-update publication event anymore, but delete/recreate history cannot be inferred from a current ref. Tag protection is the control for that history.

## Draft and asset consistency

Drafts must specify the exact expected SHA, not a branch name. Channel, tag and compatibility metadata must match. Expected uploaded assets are checked by size and SHA-256 digest before publication and checked again afterwards. Published matching assets are never overwritten.

The GitHub Releases API does not document a compare-and-swap transaction covering tags, assets and publication. Re-reading, pinning the target and checking after publication **does not eliminate an authorized editor's last-instant concurrent mutation**. Keep a single release writer and do not edit drafts manually during a run. A detected conflict fails the run for inspection; it does not automatically delete or roll back someone else's changes. A post-publication failure can mean publication already occurred; inspect before retrying.

Existing 2.0.1 remains unchanged and PR #6 is not released. Historical published releases may say `target_commitish: main`; their verified tag is authoritative. New drafts cannot use that mutable form.

This security patch modifies the existing standalone Node `.mjs` tooling rather than adding a compiler dependency to the privileged job. A future TypeScript migration should use a reviewed, dependency-free execution path and preserve this trust boundary.
