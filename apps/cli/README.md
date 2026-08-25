# Workspace CLI

`apps/cli` is the executable composition root for administration commands owned by workspace packages. It defines the root `cli` program, composes package environment fragments in `env.ts`, and adds the commands exported by those packages.

The Commercetools project provisioning, migration, schema export, and type-generation commands are implemented by `packages/commerce-commercetools/cli`. CMS provisioning and migrations are implemented behind the selected provider's `@repo/cms/cli` export.

Copy `.env.example` to `.env` and provide the environment required by the composed package schemas. Environment validation is lazy: help and commands that do not use Commercetools can run without Commercetools credentials. To target a different environment without changing `.env`, pass the global option before the command:

```bash
pnpm cli --env-file /absolute/path/to/project.env commerce migrate plan
```

Common commands:

```bash
# Inspect and run the selected CMS provider's setup workflow.
pnpm cli cms provision --help

# Preview and apply Contentstack migrations when that provider is selected.
pnpm cli cms migrate plan --management-token-alias next-hydra-bootstrap
pnpm cli cms migrate --management-token-alias next-hydra-bootstrap

# Provision a manually-created project using a one-time bootstrap API Client.
# The output path must not exist.
pnpm cli --env-file apps/cli/.env.bootstrap.local commerce project provision \
  --output apps/cli/.env.runtime.local

# Re-run the idempotent starter-kit migrations later
pnpm cli --env-file apps/cli/.env.runtime.local commerce project seed

# Preview and apply schema migrations
pnpm cli commerce migrate plan
pnpm cli commerce migrate

# Export Product Types and Custom Types
pnpm cli commerce schema export

# Generate provider-private Custom Field helpers and the provider-neutral
# Product Attribute artifact from packages/commerce-commercetools/schema
pnpm cli commerce types generate
```

The gitignored `.env.bootstrap.local` contains `COMMERCETOOLS_PROJECT_KEY`, `COMMERCETOOLS_REGION`, `COMMERCETOOLS_BOOTSTRAP_CLIENT_ID`, and `COMMERCETOOLS_BOOTSTRAP_CLIENT_SECRET`. Provisioning enables Product Projection Search, creates an exact-scoped runtime API Client, applies pending migrations, writes and reads back `.env.runtime.local` with `0600` permissions, and only then revokes the bootstrap API Client. It never invokes the Vercel CLI and never prints either secret.

Package composition:

- `apps/cli/env.ts` extends environment fragments exported by command packages.
- `apps/cli/src/program.ts` adds the `Command` objects declared by packages.
- `packages/commerce-commercetools/keys.ts` owns the Commercetools environment schema.
- `packages/commerce-commercetools/cli` owns the Commercetools commands and implementation.
- The selected CMS package's `cli` export owns its provider-specific provisioning workflow.

To add commands from another package:

1. Export that package's environment fragment from its `keys.ts`.
2. Export one namespaced root-command factory from its `cli` module. Accept an environment provider rather than reading `process.env` in the command.
3. Extend the package keys in `apps/cli/env.ts`.
4. Add the returned root command in `apps/cli/src/program.ts`.

The app owns environment-file loading and composition. Package commands own their schemas and only resolve the composed environment when a command actually needs it.
