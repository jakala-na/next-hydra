# Releasing `create-next-hydra`

`create-next-hydra` is versioned with the public `next-hydra` starter release. We do not publish on every merge.

## What goes in release notes

Use a hybrid changelog style:

- CLI behavior changes (`create-next-hydra`)
- Notable changes in the generated starter output
- Breaking changes / migration notes

Do not document unrelated internal monorepo churn unless it changes what users scaffold.

## Commands

Create a changeset (only for user-facing scaffold/CLI changes):

```bash
pnpm changeset
```

Review pending changesets:

```bash
pnpm changeset:status
```

Version the CLI package for the next starter release:

```bash
pnpm version:cli
```

Dry-run publish flow (build + pack + npm publish dry-run):

```bash
pnpm release:create-next-hydra:dry-run
```

Publish (runs `changeset version`, then build + pack + publish):

```bash
pnpm release:create-next-hydra
```

## Notes

- `release:create-next-hydra` expects you to be intentionally cutting a release.
- The publish script defaults to failing on a dirty worktree.
- If you need to test the script in a dirty repo, use the underlying script with `--allow-dirty`.
