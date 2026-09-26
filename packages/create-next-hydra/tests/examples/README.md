# Composition examples

These are authored input trees, not snapshots of the implementation's output or complete Next.js starter applications.

- `editorial/`: selected registry files and a module-reference template; an unselected item deliberately references an absent source.
- `conditional/`: optional CMS–Commerce recipe, nested conditional recipe with a dependency cycle, and required/forbidden provider constraints.
- `packages/`: transitive internal package dependencies and explicitly fake environment data that must not be copied.
- `bindings/`: two CMS implementations, qualified registry references, a consumer with a pre-existing provider binding, JSONC compiler settings, explicit TypeScript aliases, root/app/transitive package requirements, and conflicting bindings/toolchain requirements. Selection replaces or removes owned entries without copying an unselected provider or changing canonical files.
- `included/`: declaration-relative files loaded through an included source registry.
- `compiled/`: an installable, product-neutral TypeScript application with a module-reference template. The packed-executable harness builds and executes its output through the application's own Turbo graph and rejects a simulated unsafe edit through real linting. Its unregistered template proves authored examples are not mistaken for production templates.
- `registry/`: an ordinary project with published-style item artifacts for file addition, package requirements, provider bindings and conflicting dependency graphs. Native-addition checks exercise this folder without composition receipts or locks.
- `application/`: shared web application with ordinary Portless commands, layout wrappers and an account element, configuration calls, environment factories, GraphQL fragment bindings, opaque assets, pnpm patch declarations and recipe compatibility. `editorial-site` omits the optional selections; `enhanced-site` selects a compatible graph including branding, a patch and tracking. Unselected entries include conflicting/dangling patch declarations and a preset. Root tooling and pnpm inputs deliberately contain maintainer-only data to check isolation. The lockfile is illustrative input, not an installable dependency snapshot.

The `packages/` example also contains precomposed template targets. The selected target must come from its template, and the inactive target must stay out of the materialized package.

The `application/` example's `configured-site` definition has an intentionally empty root `.gitignore`, an app ignore file, independently authored deployment settings and a README. Initialization must preserve those settings, while `editorial-site` receives missing root ignore defaults. The source application's deployment defaults belong in fresh project output, not in named-workspace settings. Tests simulate restored cache bytes and conflicting paths in memory; they do not test Turbo's cache implementation.

The same example keeps its public web `.env.example` as documentation; it does not initialize `.env.local`. A test simulates an invalid registry mapping to verify that it fails before publication. `local-environment/` contains deliberately fake primary/checkout env data for explicit local-copy tests. Tests copy those authored bytes into simulated ignored paths; no developer credentials are read. The live command case uses a scoped Git repository and a second worktree to exercise precedence, tracked/example exclusions and runtime-cache exclusions. In-memory filesystem fault injection checks preservation, private permissions and partial-write reporting.

Focused service tests load an example into fresh in-memory storage. Disk integration tests copy an example into scoped temporary storage so upstream tools can use normal files without modifying these inputs. Only fault injection or simulated edits change files during a test. Do not materialize output into these authored directories.

Repository lint checks these input trees for syntax and non-type-aware rules. They intentionally lack complete dependencies and compiler settings, so application type checking belongs to composed output; the packed-executable exercise installs, typechecks and builds the `compiled/` example. Test implementations and CLI source retain full type-aware linting.
