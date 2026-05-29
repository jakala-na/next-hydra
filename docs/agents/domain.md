# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT-MAP.md` at the repo root. It routes tasks to the relevant domain context docs.
- The context docs listed in `CONTEXT-MAP.md` that match the task.
- `docs/adr/` for system-wide decisions that touch the area you're about to work in.
- Context-scoped ADRs when a mapped context points to them.

Shared agent operating guidance belongs in `AGENTS.md`. Domain vocabulary belongs in context docs.

If any of these files don't exist, proceed silently. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context repo:

```text
/
├── AGENTS.md                           <- shared agent operating guidance
├── CONTEXT-MAP.md                      <- routes tasks to domain contexts
├── docs/adr/                           <- system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                   <- context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

This repo currently maps Registration to the root `CONTEXT.md`. Move that context into a dedicated context directory when additional bounded contexts make the split useful.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant context doc. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because..._
