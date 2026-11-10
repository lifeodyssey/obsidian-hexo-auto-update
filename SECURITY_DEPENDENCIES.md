# Obsidian dependency security

CVE-2021-38148 / [GHSA-45mx-g85m-wwm3](https://github.com/advisories/GHSA-45mx-g85m-wwm3)
affects Obsidian versions before 0.12.12: opening non-HTTP(S) URLs did not
require confirmation.

The npm `obsidian` package here is a **development SDK**. The build marks
`obsidian` as external, so upgrading the SDK does not upgrade the desktop app.
Users must keep their installed Obsidian application updated independently.

The SDK is pinned to 1.14.4 and captured in `package-lock.json`; use `npm ci`
for reproducible installs. The plugin manifest now requires at least 0.15.0,
matching this release's existing `versions.json` entry and excluding the
known vulnerable host versions. This minimum is not a claim that every
feature has been manually tested on that old release; use a current app.

Regression checks prevent reintroducing an unsafe host minimum or an
unpinned/unlocked SDK. They do not substitute for testing inside Obsidian.
The repository previously had no runnable tests despite its README's test
coverage claims; these checks are not comprehensive functional coverage.

## Git operations

`simple-git` is upgraded to 4.0.2 to address unsafe-operation guard bypasses
(GHSA-v5rq-49vh-5v5c, GHSA-x6jw-m9v5-85vh, GHSA-g4wm-2vf7-vfgr,
GHSA-858h-whjf-mvg5). An integration test exercises repository detection,
staging, status, committing and pushing to a temporary local bare repository.
It does not push to an external service or test user credentials.

## Release validation and limits

This security preview passes `npm ci --ignore-scripts`, `npm run check`
(lint, typecheck, three regression tests), and `npm run build` on Node 24.
The linter retains three existing `no-explicit-any` warnings. Production
`npm audit --omit=dev` reports zero vulnerabilities on 2026-11-10.
The full audit still reports 22 moderate and four low findings in development
tooling (glob/minimatch/deepmerge and dependents). These have not been
force-upgraded across incompatible major versions. This is not an all-clear
for the entire dependency tree.

No Obsidian desktop UI/real-vault smoke test has been performed. The release
is deliberately a prerelease, not a claim of stable end-user acceptance.

## Release maintenance

Every new version must also update `release-config.json` with the same version
and an explicit `prerelease` or `stable` channel. The current 2.0.1 remains a
prerelease. A non-version-changing push does not republish it. Detection uses
the complete push base (`github.event.before`), including batched commits.

Publication stages assets in a draft first. Retries reuse existing releases;
published matching assets are left untouched, missing assets can be added,
and tag/asset/channel conflicts fail closed. Network/authentication failures
are not treated as a missing release. Tests simulate these cases without
creating GitHub releases. Before promoting a future stable version, run a
real Obsidian/real-vault smoke test; these tests do not replace that check.
