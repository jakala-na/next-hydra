---
"create-next-hydra": minor
---

Update the CLI for the current registry contract: Search providers, package/recipe kinds, conditional dependencies, and provider requirements. Scaffolding now materializes only selected applications and packages, including CMS-only compositions.

Add named-workspace `compose` with safe refresh, watching, file checks, diffs, source explanations, and opt-in environment copying. Registry additions validate the complete dependency graph before installation.

Breaking: `compose` replaces `use`; programmatic composition exports are replaced by the Effect-backed `cliProgram`/`runCli` entry points. See the CLI README for migration and command options.
