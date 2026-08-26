# Releasing `create-next-hydra`

`create-next-hydra` is the only npm package released from this repository. Its version describes the published orchestrator: commands, programmatic exports, bundled schemas, and installation behavior.

The npm version does not identify a next-hydra starter snapshot. By default, the CLI clones current `main`; use both a pinned CLI package and `--ref <git-ref>` when a scaffold must be reproducible.

next-hydra supports the current CLI against the current platform. Publishing a new CLI version does not create an upgrade or long-term-support contract for customer-owned projects.

## What goes in package release notes

Document observable changes to the published artifact:

- CLI commands, options, prompts, output, and errors
- Programmatic exports and bundled schemas
- Scaffold, composition, and registry-installation behavior owned by the CLI
- Runtime compatibility or dependency changes that affect users

Do not include starter-only changes fetched from `main`, platform announcements, or unrelated monorepo work. Those belong in the dated Platform Updates section of the docs website.

## Automated release

Create a changeset alongside each user-visible package change:

```bash
pnpm changeset
```

Review pending release intent:

```bash
pnpm changeset:status
```

After changes containing a changeset merge to `main`, the `Release create-next-hydra` workflow validates the package and creates or updates a release pull request. That pull request runs `pnpm version:cli`, so it contains the package version bump, generated changelog, and consumed changesets.

Review and merge the release pull request when the batch is ready. The next workflow run publishes the committed package version with `changeset publish` and npm trusted publishing. The feature merge does not publish immediately; merging the reviewed release pull request is the release gate.

### One-time repository setup

Configure `create-next-hydra` on npm with this GitHub Actions trusted publisher:

- Organization or user: `jakala-na`
- Repository: `next-hydra`
- Workflow filename: `release-create-next-hydra.yml`
- Allowed action: `npm publish`

The filename must match `.github/workflows/release-create-next-hydra.yml` exactly. The workflow uses GitHub's short-lived OIDC identity and does not require an `NPM_TOKEN` secret.

In the GitHub repository's Actions settings, enable **Allow GitHub Actions to create and approve pull requests** so Changesets can maintain the release pull request.

## Manual fallback

To prepare a release without GitHub Actions, consume the pending changesets locally:

```bash
pnpm version:cli
```

Review the resulting `packages/create-next-hydra/package.json` version and `packages/create-next-hydra/CHANGELOG.md`, then commit those generated changes before publishing.

From the clean version commit, run the complete build, pack, and npm publish dry run:

```bash
pnpm release:create-next-hydra:dry-run
```

Publish that same committed version:

```bash
pnpm release:create-next-hydra
```

The manual publish command does not calculate or change a version. It builds, packs, and publishes the version already present in `packages/create-next-hydra/package.json` using the npm authentication available to the local environment.

## Notes

- Release commands fail on a dirty worktree by default.
- The package version and generated changelog must be reviewed and committed before publication.
- The automated workflow builds before publishing and disables npm lifecycle scripts during `changeset publish`, so it publishes the reviewed build output once.
- Use `--allow-dirty` with `--dry-run` only for local release-script testing. Real publications always require a clean worktree.
