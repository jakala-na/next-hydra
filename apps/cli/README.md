# Workspace CLI

`apps/cli` is the executable composition root for administration commands owned by workspace packages. It defines the root `cli` program, supplies shell and environment-file configuration, and adds the commands exported by those packages.

The Commercetools project provisioning, migration, schema export, and type-generation commands are implemented by `packages/commerce-commercetools/cli`. CMS provisioning and migrations are implemented behind the selected provider's `@repo/cms/cli` export.

Run commands from the root of an installed customer or development workspace:

```bash
pnpm --filter cli cli --help
```

The selected packages determine which commands are available. pnpm runs the CLI in `apps/cli`, so relative `--env-file` and `--output` paths resolve there. There is no root `pnpm cli` shortcut.

Copy `apps/cli/.env.example` to `apps/cli/.env` and provide the environment required by the commands you run, or supply it through the shell. With the default `.env`, shell values take precedence. Environment validation is lazy: help and commands that do not need credentials can run without them. To target a different environment without changing `.env`, pass the global option before the command; an explicit `--env-file` takes precedence over shell values:

```bash
pnpm --filter cli cli --env-file /absolute/path/to/project.env commerce migrate plan
```

Common commands:

```bash
# Create the selected customer identity provider's webhook once. The command
# never updates or deletes an existing endpoint. An exact managed endpoint can
# be read on rerun to recover its secret; any drift is reported as a conflict.
# The output path must not exist and receives only the signing secret.
pnpm --filter cli cli auth provision \
  --api-url https://api.example.com \
  --output .env.auth-webhook.local

# Publish the signing secret directly to every required linked Vercel project.
# Providers select apps/web, apps/api, or both. Preflight verifies every link,
# local Vercel login, access, custom target, and key conflict before mutation.
pnpm --filter cli cli auth provision \
  --api-url https://api.example.com \
  --store vercel \
  --environment preview \
  --environment preview:feature/auth \
  --environment staging \
  --environment production

# Re-provision the exact provider manifest into an existing demo environment.
# This upserts only the selected keys in the selected linked projects/targets.
pnpm --filter cli cli auth provision \
  --api-url https://api.example.com \
  --store vercel \
  --environment demo-replacement \
  --overwrite

# Inspect and run the selected CMS provider's setup workflow.
pnpm --filter cli cli cms provision --help

# Preview and apply Contentstack migrations when that provider is selected.
pnpm --filter cli cli cms migrate plan --management-token-alias next-hydra-bootstrap
pnpm --filter cli cli cms migrate --management-token-alias next-hydra-bootstrap

# Provision a manually-created project using a one-time bootstrap API Client.
# The output path must not exist.
pnpm --filter cli cli --env-file .env.bootstrap.local commerce project provision \
  --output .env.runtime.local

# Re-run the idempotent starter-kit migrations later
pnpm --filter cli cli --env-file .env.runtime.local commerce project seed

# Preview and apply schema migrations
pnpm --filter cli cli commerce migrate plan
pnpm --filter cli cli commerce migrate

# Export Product Types and Custom Types
pnpm --filter cli cli commerce schema export

# Generate provider-private Custom Field helpers and the provider-neutral
# Product Attribute artifact from packages/commerce-commercetools/schema
pnpm --filter cli cli commerce types generate
```

The gitignored `.env.bootstrap.local` uses the standard Commercetools API Client variables: `CTP_PROJECT_KEY`, `CTP_CLIENT_SECRET`, `CTP_CLIENT_ID`, `CTP_AUTH_URL`, `CTP_API_URL`, and `CTP_SCOPES`. Provisioning verifies that the bootstrap client can manage project settings and API clients, enables Product Projection Search, creates an exact-scoped runtime API Client, applies pending migrations, publishes the application's `COMMERCETOOLS_*` runtime environment, and only then revokes the bootstrap API Client. Local publication creates and verifies a `0600` file. Vercel publication uses the links in each provider-selected `apps/web` or `apps/api` project and local Vercel CLI credentials, refuses existing keys by default, and requires a new deployment before the variables take effect. Operators may pass `--overwrite` to upsert only the provider manifest's exact keys in the selected projects and environments; `--yes` only skips confirmation and does not authorize replacement. Ambiguous overwrite responses are retried in-process with the same values. After a partial or unknown publication failure, the runtime client is preserved because a Vercel project may reference it; a fresh `--overwrite` provisioning run creates replacement credentials and converges every selected target, potentially leaving the earlier client for manual cleanup. Supported selectors are `production`, `preview`, `preview:<branch>`, and existing custom-environment slugs; Development intentionally remains local. Provisioning never prints secrets.

Package composition:

- `apps/cli/src/config-provider.ts` loads configuration without validating every installed package's requirements.
- `apps/cli/src/program.ts` wires package command factories into the root command and passes them the lazy configuration provider.
- Command handlers and services resolve and validate the configuration they need through Effect Config. There is no CLI-wide `env.ts` or eager composition of package `keys.ts` validators.
- `packages/commerce-commercetools/cli` owns the Commercetools commands and implementation.
- The selected auth package's `cli` export owns its customer webhook manifest and provider API integration.
- The selected CMS package's `cli` export owns its provider-specific provisioning workflow.

To add commands from another package:

1. Export one namespaced root-command factory from the package's `cli` module. Accept the lazy configuration provider rather than reading `process.env` directly.
2. Validate configuration in the command handler or service that needs it. Provisioning may need bootstrap credentials before application runtime credentials exist; unrelated commands must not require either.
3. Wire the factory according to where you are authoring:

   - In the maintainer source, add a registry `slotBindings` entry targeting the `commands` slot of `apps/cli/src/program.ts`, with the factory's module and export. Composition uses `apps/cli/registry/templates/program.ts.template` to materialize the program. Edit that template when changing its shared structure.
   - In an installed customer workspace, edit the ordinary `apps/cli/src/program.ts` directly: import the factory and add its result to `Command.withSubcommands`, passing the existing `configProvider`. No registry or template refresh is needed.

The app owns environment-file loading and command wiring. Packages own command-specific schemas and validation; application startup validation remains separate.
