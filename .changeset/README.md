# Changesets Policy (`create-next-hydra`)

This repo uses Changesets for **starter releases**, not for every merge.

Current scope:
- Publishable package: `create-next-hydra` only
- Version tracks the public `next-hydra` starter release
- Multiple merges may be batched into one release

## When to add a changeset

Add a changeset only when a change affects:
- CLI behavior (`create-next-hydra` flags, prompts, clone/sanitize behavior)
- The generated starter output users receive after scaffolding
- Breaking setup assumptions or migration steps

Do not add a changeset for internal-only refactors that don't affect scaffolded output.

## Changeset summary style (hybrid)

Summaries should describe user-visible impact:
- CLI changes (if any)
- Generated starter changes (if any)
- Breaking changes / migration notes (if any)

Keep it concise and user-facing.

## Typical release flow

1. `pnpm changeset` (for user-facing starter/CLI changes)
2. Batch merges until ready to ship a starter release
3. `pnpm version:cli`
4. Review generated changelog/version bump
5. `pnpm release:create-next-hydra:dry-run`
6. `pnpm release:create-next-hydra`
