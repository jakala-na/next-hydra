# @repo/cms-drupal

Drupal GraphQL implementation for the Next Hydra CMS interface.

This package owns Drupal-specific OAuth, GraphQL transport, schema generation,
preview routing, page and block rendering, native menu navigation, and image
configuration. Applications select it through the stable `@repo/cms` dependency
name:

```json
{
  "dependencies": {
    "@repo/cms": "workspace:@repo/cms-drupal@*"
  }
}
```

The connector maps Drupal route entity and Paragraph `__typename` values through
page and component registries. Unsupported types are ignored until their Hydra
renderers are implemented.

## Drupal content model

The generated schema now exposes the Drupal-native Hydra structure:

- `NodeLandingPage` with ordered `components`, display-title fields, and route
  alias.
- `NodeArticle` with summary, image, processed Basic HTML body, and route alias.
- `ParagraphHero` for tagline, heading, description, image, and actions.
- `ParagraphDynamicProductCollection` with an optional external commerce
  category ID. Omitting it requests products without a category filter.
- `ParagraphFeaturedArticle` with an ordered set of referenced Articles.
- `menu(name: MAIN)` for native Drupal navigation.

Drupal configuration for this model lives in
`apps/drupal-hydra/recipes/next-hydra-starter/config`.

## Environment

For code generation, copy `.env.example` to this package's `.env`. For a Next.js
application, put the same values in the consuming application's `.env.local`.

DDEV uses a locally trusted HTTPS certificate. Start Node with the system CA
store when the consuming application talks to a `.ddev.site` origin:

```bash
NODE_OPTIONS=--use-system-ca pnpm --filter web dev
```

`DRUPAL_BASE_URL` identifies the Drupal origin. The auth and GraphQL endpoints
default to `/oauth/token` and `/graphql`; the URI variables override those paths.
The previewer pair reads draft content, while the viewer pair reads published
content.

The Drupal installer prints the prefixed previewer and viewer variables after
creating the OAuth consumers. It also prints `CMS_REVALIDATION_SECRET` for the
consuming web application. Keep those values out of version control.

## Cache revalidation

Published pages use one cached Drupal `route(path:)` query with the `hours`
Cache Components profile. The returned entity's `__typename` selects its Hydra
page template, and the page template's component renderer maps its Paragraphs.
A successful page is tagged with its Drupal entity cache tag, such as `node:1`.
Page components can contribute additional dependencies: Featured Articles adds
the `node:{id}` tag of every referenced Article. Editing an Article therefore
invalidates its own cached route and any cached landing page that renders it,
without evicting every landing page or Article. Missing or unsupported routes
use a zero-expiry cache life, so they remain dynamic instead of becoming a
persistent 404 cache entry. Published main-menu queries use the `days` profile
and the `menu` tag. Preview reads bypass shared caches.

Drupal's Next module revalidates content after entity changes by calling
`/api/revalidate` with the entity tags and its configured shared secret. The
route uses eager expiration, so the first request after a publish waits for
fresh Drupal content and subsequent requests use the refreshed cache entry.

## Preview

Next.js for Drupal renders saved revisions in the node's View-tab iframe. Its
short-lived signed URL is validated against Drupal's `/next/draft-url` endpoint,
then translated to the matching GraphQL `current`, `latest`, or exact revision.

GraphQL Compose Preview handles unsaved form previews. Its iframe opens
`http://localhost:3001/api/drupal-preview` with the preview UUID and token; set
`GRAPHQL_COMPOSE_PREVIEW_URL` in Drupal to override that URL while preserving
the `[node:preview:uuid]` and `[node:preview:token]` placeholders.

The draft route validates the UUID and token through Drupal's GraphQL `preview`
query before enabling Next.js Draft Mode. It stores the validated preview in an
HTTP-only cookie, redirects to the node's canonical path, and loads the exact
temporary preview entity instead of the latest saved revision.

Drupal Canvas owns `/api/draft`, `/api/draft/renew`, `/api/disable-draft`, and
`/api/canvas/components`. `CANVAS_SITE_URL` can override the Drupal origin for
Canvas; when omitted it defaults to `DRUPAL_BASE_URL`.

## GraphQL schema

```bash
pnpm --filter @repo/cms-drupal generate
```

Generation authenticates as the viewer, refreshes `gql/schema.graphql`, and
updates gql.tada's introspection and document cache artifacts.

## Validation

```bash
pnpm --filter @repo/cms-drupal test
pnpm --filter @repo/cms-drupal typecheck
```
