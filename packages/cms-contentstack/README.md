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

## Validation

```bash
pnpm --filter @repo/cms-contentstack typecheck
pnpm --filter @repo/cms-contentstack test
```
