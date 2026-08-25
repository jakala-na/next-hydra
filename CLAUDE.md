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
