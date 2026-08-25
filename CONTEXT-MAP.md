# Context Map

This repo uses a multi-context domain documentation layout. Use this map to find the domain context that applies to the task.

Shared agent operating guidance belongs in `AGENTS.md`, not in this map.

## Contexts

| Context | Context doc | ADRs | Notes |
| --- | --- | --- | --- |
| Registration | `CONTEXT.md` | `docs/adr/` | Current domain context for company access requests. Split into a context-specific directory when additional bounded contexts are introduced. |
| Checkout | `packages/commerce/CONTEXT.md` | `docs/adr/` | Current domain context for turning a cart into an order-ready purchase. |
| Workspace Composition | `packages/create-next-hydra/CONTEXT.md` | `docs/adr/` | Selects and materializes the baseline, providers, and add-ons in scaffolded and maintainer workspaces. |
