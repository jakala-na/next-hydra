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

This package is a composition-ready scaffold. Delivery GraphQL or REST queries, Live Preview, navigation, and space provisioning are not implemented yet. Page routes currently resolve to `notFound()` until those clients land.

## Environment

Copy `.env.example` into the consuming application's `.env` and fill:

- `CONTENTFUL_SPACE_ID`
- `CONTENTFUL_ENVIRONMENT`
- `CONTENTFUL_MANAGEMENT_TOKEN` (CLI migrations only; not used by the Next.js runtime)
- `CONTENTFUL_DELIVERY_TOKEN`
- `CONTENTFUL_PREVIEW_TOKEN`
- `CONTENTFUL_PREVIEW_SECRET`

Preview URLs should call `/api/draft?secret=<CONTENTFUL_PREVIEW_SECRET>&slug=/path`.

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
