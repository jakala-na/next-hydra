# Effect-owned workspace execution

Status: Accepted

Workspace composition needs coherent resource lifetime, typed failures, replaceable filesystem/process services and serialized observation. The CLI and repository helpers share one Effect implementation. Effect CLI owns arguments and prompts; bound workspace handles own operations; composition prepares detached output; publication, dependencies, state and snapshots keep separate responsibilities. This refines [ADR-0004](0004-use-next-hydra-over-shadcn-for-workspace-composition.md) and [ADR-0010](0010-compose-named-workspaces-for-development-and-deployment.md), without changing provider manifests or the physical-copy authoring model.

## Execution boundaries

Preparation uses disposable staging and retains upstream ShadCN artifacts. Publication performs verified per-file changes; it is not a whole-directory transaction or an automatic rollback. Effect scopes own resources and subprocess completion. A worker success message does not prove descendant completion or authorize deleting staging. Filesystem paths are trusted; this is not a security sandbox.

Named Sync owns installation by default and retains successful-install evidence. Watch uses that same operation, serializes saves with Effect primitives and reports one result per synchronization. Application processes belong to Turbo: compose explicitly, then run build, typecheck, dev or browser tests within the installed application's dependency graph. Watch and dev run in separate terminals.

A local filesystem directory lock protects named synchronization from cooperating writers. No database, heartbeat or process-liveness subsystem is needed for this single-user tool. Verified recovery is automatic; uncertain lock removal requires CLI authorization after other Compose processes are stopped, and archives evidence. It does not override ownership conflicts or kill a process.

Ordinary Add is different: inspect the registry graph and project preconditions, obtain CLI confirmation, then delegate native installation into the existing configured project. No managed receipt, snapshot or lock is added. Configuration-dependent changes require an existing ShadCN context; no root CSS configuration is invented. Dependency-bearing additions install on each explicit invocation. Failures may leave partial changes for inspection.

Examples never seed runtime environment files. Provisioning owns values, while explicit `--copy-env` copies missing local files without recording their contents or fingerprints.

## Verification and limits

Behavior is tested at workspace operations, the ShadCN boundary and public CLI/package boundaries. Authored examples can run through in-memory filesystem Layers or scoped disk copies; standalone scaffold checks execute real installed application commands. Tests do not assert provider inventories or reimplement Turbo's affected calculation.

The current process-completion and watcher evidence is Linux-specific. Windows worker execution is explicitly unsupported; macOS and network-filesystem behavior still need validation. Ownership state is private and is never silently adopted or discarded when incompatible. Publication, merging and migration of existing local work remain separate decisions from switching source entrypoints.
