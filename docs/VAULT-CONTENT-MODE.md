# Experimental same-vault public-content mode

This is an **opt-in** alternative to external Hexo repository mode. It does not migrate notes or create a remote repository. Defaults remain the external safe-reference mode. Switching modes disables automatic watching, committing and pushing until you explicitly choose them and apply configuration.

## One authoritative source

```
MainVault/
  PrivateNotes/
  BlogContent/             # an EXISTING separate Git root containing ONLY public material
    .git/
    _posts/hello.md
    _posts/hello/photo.png
    images/
ExternalHexoEngine/
  _config.yml
  content -> MainVault/BlogContent
  node_modules/
```

Set Public content folder and Content Git root to the same absolute `BlogContent` path. This first implementation deliberately disallows the whole vault's Git repository or a broad ancestor repository. This reduces accidental inclusion of private notes; it does not perform an OS sandbox. The public content path and descendants must be ordinary paths with no nested symlinks, hardlinks, or hidden files, except root Git metadata.

Markdown modifications use Obsidian `Vault.read` and `Vault.process`, not external filesystem replacement. The process callback compares content with the asynchronous transformation's input and aborts if it changed. A newly created file not yet indexed by Obsidian produces a retryable error, never a filesystem fallback.

Only `_posts` is automatically scanned, watched and committed, including its article attachments. `images/`, standalone pages and Git configuration need separate manual Git review/commit in this first version. Deletes are scoped to `_posts`; unrelated staged work blocks automated commits. An auto-push pushes the repository's branch, not an isolated subset of commits: review existing history/remote before enabling it.

## Explicit local build setup

The optional Prepare Vault Content Build Link action checks the public tree and creates **ExternalHexoEngine/content pointing into the vault**, never a link from the vault to the external engine. An existing correct link is reused; any other existing path, including a broken link, is refused, not deleted. The engine must be outside and not contain the vault. This action does NOT run Hexo or modify `_config.yml`.

Configure the external engine:

```yaml
source_dir: content
post_asset_folder: true
```

Why not an absolute external `source_dir`? Hexo 8.1.2 in our fixture silently omitted article-folder assets when source was outside the engine's lexical base. The inward `content` link and an ordinary CI `content` checkout both generated posts and assets correctly. Your theme/renderer still requires an isolated build before migration. Links may require privileges on Windows; Windows has not been tested.

## CI contract, not a new remote created for you

CI should check out engine code into a site directory and the explicitly chosen public-content repository into `site/content`, using fixed commits where reproducibility matters. Do not commit a workstation-specific absolute symlink. Authentication and repository sharing are separate explicit setup, not something the plugin changes.

Before every build, validate that content exists, `_posts` contains at least one Markdown post, and the public tree has no links/hidden surprises. Generate into a clean output directory and confirm the expected routes and asset hashes before deploying; Hexo may exit successfully after generating zero files. Merely enabling this plugin does not add those CI gates to another repository. The service's preflight is available to local setup and automated commit flows, not a complete CI installer.

## Syntax and privacy limits

The initial preflight **rejects** `[[wiki links]]` and `![[embeds]]`, rather than recursively resolving private notes or pretending Hexo supports them. Use standard Markdown links to public content. It also conservatively rejects common local/traversing references, including encoded forms. It can reject harmless code samples, and is not a complete Markdown/HTML parser; it is not a guarantee against every encoded URL, malicious renderer, or concurrent filesystem change. Review public content before publication and never configure the whole private vault as Hexo input.

Dynamic/future changes to input are not a cross-process atomic snapshot. The reverse link is useful for local preview; a committed content revision checked out in clean CI is the reproducible publication input.

## Migration gate

No move, delete or migration happens automatically. Inventory originals, unpublished changes and Git history; copy first, hash-check, test theme/images/drafts, and only then choose an explicit cutover. Existing external vault links must still be manually migrated. Do not run old unsafe versions alongside the new mode.
