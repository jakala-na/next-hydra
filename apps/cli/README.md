# Workspace CLI

`apps/cli` is the executable composition root for administration commands owned by workspace packages. It defines the root `cli` program, composes package environment fragments in `env.ts`, and adds the commands exported by those packages.

The Commercetools project provisioning, migration, schema export, and type-generation commands are implemented by `packages/commerce-commercetools/cli`. CMS provisioning and migrations are implemented behind the selected provider's `@repo/cms/cli` export.

Copy `.env.example` to `.env` and provide the environment required by the composed package schemas. Environment validation is lazy: help and commands that do not use Commercetools can run without Commercetools credentials. To target a different environment without changing `.env`, pass the global option before the command:

```bash
pnpm cli --env-file /absolute/path/to/project.env commerce migrate plan
```

Common commands:

```bash
# Create the selected customer identity provider's webhook once. The command
# never updates or deletes an existing endpoint. An exact managed endpoint can
# be read on rerun to recover its secret; any drift is reported as a conflict.
# The output path must not exist and receives only the signing secret.
pnpm cli auth provision \
  --api-url https://api.example.com \
  --output apps/cli/.env.auth-webhook.local

# Publish the signing secret directly to every required linked Vercel project.
# Providers select apps/web, apps/api, or both. Preflight verifies every link,
# local Vercel login, access, custom target, and key conflict before mutation.
pnpm cli auth provision \
  --api-url https://api.example.com \
  --store vercel \
  --environment preview \
  --environment preview:feature/auth \
  --environment staging \
  --environment production

# Re-provision the exact provider manifest into an existing demo environment.
# This upserts only the selected keys in the selected linked projects/targets.
pnpm cli auth provision \
  --api-url https://api.example.com \
  --store vercel \
  --environment demo-replacement \
  --overwrite

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

The gitignored `.env.bootstrap.local` uses the standard Commercetools API Client variables: `CTP_PROJECT_KEY`, `CTP_CLIENT_SECRET`, `CTP_CLIENT_ID`, `CTP_AUTH_URL`, `CTP_API_URL`, and `CTP_SCOPES`. Provisioning verifies that the bootstrap client can manage project settings and API clients, enables Product Projection Search, creates an exact-scoped runtime API Client, applies pending migrations, publishes the application's `COMMERCETOOLS_*` runtime environment, and only then revokes the bootstrap API Client. Local publication creates and verifies a `0600` file. Vercel publication uses the links in each provider-selected `apps/web` or `apps/api` project and local Vercel CLI credentials, refuses existing keys by default, and requires a new deployment before the variables take effect. Operators may pass `--overwrite` to upsert only the provider manifest's exact keys in the selected projects and environments; `--yes` only skips confirmation and does not authorize replacement. Ambiguous overwrite responses are retried in-process with the same values. After a partial or unknown publication failure, the runtime client is preserved because a Vercel project may reference it; a fresh `--overwrite` provisioning run creates replacement credentials and converges every selected target, potentially leaving the earlier client for manual cleanup. Supported selectors are `production`, `preview`, `preview:<branch>`, and existing custom-environment slugs; Development intentionally remains local. Provisioning never prints secrets.

Package composition:

- `apps/cli/env.ts` extends environment fragments exported by command packages.
- `apps/cli/src/program.ts` adds the `Command` objects declared by packages.
- `packages/commerce-commercetools/keys.ts` owns the Commercetools environment schema.
- `packages/commerce-commercetools/cli` owns the Commercetools commands and implementation.
- The selected auth package's `cli` export owns its customer webhook manifest and provider API integration.
- The selected CMS package's `cli` export owns its provider-specific provisioning workflow.

To add commands from another package:

1. Export that package's environment fragment from its `keys.ts`.
2. Export one namespaced root-command factory from its `cli` module. Accept an environment provider rather than reading `process.env` in the command.
3. Extend the package keys in `apps/cli/env.ts`.
4. Add the returned root command in `apps/cli/src/program.ts`.

The app owns environment-file loading and composition. Package commands own their schemas and only resolve the composed environment when a command actually needs it.
