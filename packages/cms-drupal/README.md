# @repo/cms-drupal

Drupal GraphQL implementation for the Next Hydra CMS interface.

This package owns Drupal-specific OAuth, GraphQL transport, schema generation,
preview routing, landing-page blocks, native menu navigation, and image
configuration. Applications select it through the stable `@repo/cms` dependency
name:

```json
{
  "dependencies": {
    "@repo/cms": "workspace:@repo/cms-drupal@*"
  }
}
```

The landing-page adapter currently maps Drupal hero and dynamic product
collection Paragraphs to the existing Hydra design-system and commerce
components. Unsupported Paragraph types are ignored until their Hydra renderers
are implemented.

## Drupal content model

The generated schema now exposes the Drupal-native Hydra structure:

- `NodeLandingPage` with ordered `components`, display-title fields, and route
  alias.
- `ParagraphHero` for tagline, heading, description, image, and actions.
- `ParagraphDynamicProductCollection` with an optional external commerce
  category ID. Omitting it requests products without a category filter.
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
creating the OAuth consumers. Keep those values out of version control.

## Preview

The backend's `decoupled_preview_iframe.preview_url` must point to the Next.js
application consuming this package. The current Drupal recipe defaults to
`http://localhost:3001`; update it if the frontend runs elsewhere. The connector
preserves Drupal's preview token while enabling Next.js Draft Mode.

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
