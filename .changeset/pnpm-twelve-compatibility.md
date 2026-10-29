---
"create-next-hydra": patch
---

Support pnpm 12 when creating and refreshing workspaces. Preserve the package-manager lockfile document while selecting application dependencies, and recognize pnpm configuration environment variables when deciding whether to reinstall dependencies.

New workspaces also deduplicate nested peer variants so application middleware shares the same Next.js runtime classes.
