# Changesets Policy (`create-next-hydra`)

This repository uses Changesets only for the published `create-next-hydra` npm artifact. The rolling next-hydra platform is not versioned by this package.

Current scope:

- Publishable package: `create-next-hydra` only
- Private workspace packages are neither versioned nor tagged
- The package version identifies the immutable CLI artifact, not the starter source cloned from `main`
- Platform changes are documented as dated updates in `apps/docs/content/docs/updates/`
- Multiple package changes may be batched into one npm release

## When to add a changeset

Add a `create-next-hydra` changeset when a change affects the published artifact's user-facing contract, including:

- CLI commands, options, prompts, output, or failure behavior
- Programmatic exports or bundled schemas
- Scaffold, composition, or registry-installation behavior implemented by the CLI
- Runtime or dependency changes that alter observable CLI behavior

Do not add a changeset only because current `main` produces different starter code. Starter applications, workspace packages, registry source, or documentation can change without changing the npm artifact.

Internal refactors, tests, and tooling changes with no observable package effect do not need a changeset.

If one pull request changes both the rolling platform and the published CLI contract, add both a dated platform update and a `create-next-hydra` changeset. Each should describe the change for its own audience.

## Summary style

Describe the user-visible difference between npm package versions. Do not summarize unrelated starter changes or general monorepo work.

State breaking command, export, schema, or runtime changes explicitly. Keep migration steps concise and link to longer documentation when necessary.

## Typical release flow

1. Add changesets with the package changes that introduce them.
2. Merge those changes to `main`; the release workflow creates or updates the Changesets release pull request.
3. Batch merges until the next `create-next-hydra` release is ready.
4. Review and merge the release pull request containing the generated version and changelog.
5. The next `main` workflow run publishes that committed version through npm trusted publishing.

For the manual fallback, run `pnpm version:cli`, review and commit the generated changes, then use the documented dry-run and publish commands in `RELEASING.md`.
