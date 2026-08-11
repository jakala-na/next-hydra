# ShadCN GitHub source registries

Date: 2026-08-11

## Finding

Current ShadCN supports a public GitHub repository as a source registry. A root `registry.json` may use `include` to compose registry fragments located beside the source they describe. File paths in an included registry are resolved relative to that included `registry.json`.

Consumers can install a public GitHub item through an `owner/repository/item` address. ShadCN reads the source registry and repository files directly, so the repository does not need to run `shadcn build`, publish content-inlined item JSON, or host a registry application.

For local tooling, the documented `loadRegistry` and `loadRegistryItem` APIs resolve included registries and inline file contents in memory. Static hosted registries may still run `shadcn build` and publish generated item JSON, while authenticated private registries may serve the same item protocol through their chosen endpoint. That deployment form is optional and is not required for Next Hydra's official public GitHub flow.

## Next Hydra consequence

- Keep one root `registry.json` in the Maintainer Workspace.
- Keep included `registry.json` fragments beside packages and applications.
- Let `use` and local tests load those source registries directly.
- Let official public scaffold and `add` requests use GitHub registry addresses.
- Do not create or check in a second generated registry-output directory in v1.
- Derive fresh-scaffold trim targets from the resolved source-registry item targets.

## Primary sources

- https://ui.shadcn.com/docs/registry/registry-json
- https://ui.shadcn.com/docs/registry/github
- https://ui.shadcn.com/docs/changelog/2026-06-github-registries
- https://ui.shadcn.com/docs/registry/api-reference
