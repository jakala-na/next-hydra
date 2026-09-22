<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.
<!-- effect-solutions:end -->

## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

Put ad hoc research in the gitignored `.scratch/research/` directory. Only keep research under a tracked `.scratch/<effort>/research/` directory when resolving a claimed Wayfinder ticket and the artifact needs a durable link from that ticket or its map. Never create loose research notes directly under `.scratch/`.

### Triage labels

Triage uses the default five-role vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context layout routed by `CONTEXT-MAP.md`; shared agent guidance belongs in this file. See `docs/agents/domain.md`.

## Source and application verification

This checkout is canonical source. Runnable applications under `workspaces/<name>/` are materialized physical copies with their own provider bindings and dependencies. Read [Named workspaces](workspaces/README.md) before application work.

- Locate the canonical implementation or template with `pnpm --filter create-next-hydra compose <name> --explain <workspace-relative-file>` when ownership is unclear. Edit that source, then refresh with `pnpm --filter create-next-hydra compose <name>`. Source edits do not automatically reach a running application.
- Before testing or inspecting a local application, require `pnpm --filter create-next-hydra compose <name> --check` to pass. A running server, an earlier successful composition, or an active watcher does not establish current freshness. Resolve reported conflicts and pending installation before verification.
- Use `compose <name> --diff` to inspect workspace-local edits against the last composition snapshot and reconcile them into canonical source. A clean diff does not prove that current source has been materialized. Root `pnpm workspace:check` validates task metadata and lockfile compatibility; it is not this application freshness check.
- Verify that the browser or test runner targets the checked workspace's server. Let development compilation finish; restart or rebuild when dependency, configuration or runtime changes require it. Report which workspace and checks were actually exercised.

Choose verification for the change. Package/domain and provider tests can run from source. Application integration tests and browser verification need a current composition. Presentation-only changes normally use focused component checks and visual inspection; changed customer journeys use relevant existing BDD scenarios, adding or changing scenarios only when their specified behavior needs to change. Materialization does not by itself require an E2E run. See the [E2E guide](docs/agents/e2e.md) for workspace delegation, manual freshness preflight and targeted execution.

## Test environment

Every package script that invokes Vitest must set `NODE_ENV=test` before the Vitest command. Vercel runs builds with `NODE_ENV=production`, where React testing APIs such as `act` are unavailable. Run `pnpm test:environment` to validate all workspace package scripts; the pre-commit hook and Turbo build/test graphs enforce the same check.

## Scaffold naming

"Next Hydra" identifies the maintainer tooling and repository, not the application being scaffolded. Keep customer workspaces, demo application behavior, seeded content, runtime metadata, public APIs, and provisioned external resources product-neutral. Do not introduce `Next Hydra`, `NextHydra`, `nextHydra`, `next-hydra`, or `next_hydra` into those customer-owned surfaces. Maintainer-only composition protocols and documentation may use the repository name when they are not materialized into a Customer Workspace.
