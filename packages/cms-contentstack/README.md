# @repo/cms-contentstack

Contentstack implementation of the Next Hydra CMS interface.

Applications consume this package through the stable `@repo/cms` dependency name. With pnpm, select this implementation in the consuming application's `package.json`:

```json
{
  "dependencies": {
    "@repo/cms": "workspace:@repo/cms-contentstack@*"
  }
}
```

Application code should import only the supported `@repo/cms/*` entry points declared in this package's export map. It should not import `@repo/cms-contentstack` directly. This keeps the provider choice at the application composition root.

Contentstack-specific GraphQL, generated types, environment keys, preview behavior, and image configuration remain owned by this package.

## Provision a stack

Version 1 provisions an existing, empty Contentstack stack. Add its Management Token to the pinned Contentstack CLI as a local alias:

```bash
pnpm --filter @repo/cms-contentstack exec csdx auth:tokens:add \
  --alias next-hydra-bootstrap \
  --management
```

Then run the provider-neutral workspace command:

```bash
pnpm cli cms provision \
  --management-token-alias next-hydra-bootstrap \
  --production-url https://store.example.com \
  --output apps/cli/.env.contentstack.local
```

The command verifies the pinned Contentstack CLI, resolves the target Stack API Key from the alias, reads the region already configured in `csdx`, and imports the checked-in recipe. The recipe creates the `landing_page` and `navigation` content types, English starter entries, and the `development` and `production` environments. Environment URLs default to `http://localhost:3001` and the supplied production URL. Runtime credential output can target either of those environments with `--environment` and defaults to `development`.

The target stack master locale defaults to `en-us`. If the stack uses another master locale, declare it so the materialized import includes English as an additional locale instead of silently skipping the starter entries:

```bash
pnpm cli cms provision \
  --management-token-alias next-hydra-bootstrap \
  --stack-master-locale fr-fr \
  --production-url https://store.example.com \
  --output apps/cli/.env.contentstack.local
```

After the import, create Delivery and Preview Tokens for the runtime environment. Enter them in the masked prompts; alternatively, supply both as `CONTENTSTACK_DELIVERY_TOKEN` and `CONTENTSTACK_PREVIEW_TOKEN` through `--env-file`. If `CONTENTSTACK_WEBHOOK_SECRET` is present, the handoff preserves it; otherwise it writes an empty value for later configuration. The command writes a new `0600` dotenv file with the region's GraphQL delivery and preview hosts, and never writes or prints the Management Token. Contentstack's importer owns recipe auditing and streams its audit and import output directly to the terminal. A provider-owned patch makes importer exceptions return a failing process status, so the command stops before credential collection when CSDX reports an import failure.

The automatic host handoff supports Contentstack's named AWS, Azure, and GCP regions. A custom or dedicated-infrastructure `csdx` region needs an explicit host contract before provisioning; the command fails without writing credentials when Contentstack's endpoint utility cannot resolve it.

The Management Token cannot create a stack, create Delivery or Preview Tokens, or configure stack-level Live Preview settings. Those remain explicit Contentstack UI steps. The local token alias is retained and must be removed separately if it was created only for provisioning:

```bash
pnpm --filter @repo/cms-contentstack exec csdx auth:tokens:remove \
  --alias next-hydra-bootstrap
```

The import is intentionally a one-shot empty-stack operation. It does not pass `--replace-existing`; update and reconciliation policy belongs in a later command.

## Validation

```bash
pnpm --filter @repo/cms-contentstack typecheck
pnpm --filter @repo/cms-contentstack test
```
