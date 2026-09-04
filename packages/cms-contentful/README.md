# @repo/cms-contentful

Contentful implementation of the CMS interface.

Applications consume this package through the stable `@repo/cms` dependency name. With pnpm, select this implementation in the consuming application's `package.json`:

```json
{
  "dependencies": {
    "@repo/cms": "workspace:@repo/cms-contentful@*"
  }
}
```

Application code should import only the supported `@repo/cms/*` entry points declared in this package's export map. It should not import `@repo/cms-contentful` directly.

Page routes use Contentful's GraphQL Content API to resolve localized landing pages and articles by slug. Landing pages render ordered hero, featured article, and dynamic product collection entries through the shared CMS design system components. Draft mode switches the same query to the Preview API token. Live Preview editing, navigation, and space provisioning are not implemented yet.

## Environment

Copy `.env.example` into the consuming application's `.env` and fill:

- `CONTENTFUL_SPACE_ID`
- `CONTENTFUL_ENVIRONMENT`
- `CONTENTFUL_MANAGEMENT_TOKEN` (CLI migrations only; not used by the Next.js runtime)
- `CONTENTFUL_DELIVERY_TOKEN`
- `CONTENTFUL_PREVIEW_TOKEN`
- `CONTENTFUL_PREVIEW_SECRET`

Preview URLs should call `/api/draft?secret=<CONTENTFUL_PREVIEW_SECRET>&slug=/path`.

Published requests use `CONTENTFUL_DELIVERY_TOKEN`. Requests made while Next.js Draft Mode is active set GraphQL's `preview` argument and use `CONTENTFUL_PREVIEW_TOKEN`.

## Content model

The starter Contentful content model matches the Drupal recipe entity types (landing page, article, hero, featured articles, and dynamic product collection). Run it against an **empty** Contentful environment; `createContentType` is not idempotent.

```bash
pnpm cli cms migrate
pnpm cli cms migrate --space-id <space> --environment <environment> --management-token <token>
```

`CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT` (default `master`), and `CONTENTFUL_MANAGEMENT_TOKEN` are read from the environment when flags are omitted.

## Validation

```bash
pnpm --filter @repo/cms-contentful typecheck
pnpm --filter @repo/cms-contentful test
```
