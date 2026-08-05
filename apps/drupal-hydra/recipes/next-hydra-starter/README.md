# Next Hydra Drupal starter recipe

This recipe provisions the Drupal content contract used by `@repo/cms-drupal`:

- one routeable `landing_page` node type;
- `hero` and `dynamic_product_collection` Paragraph bundles;
- Image Media for hero assets;
- GraphQL Compose routes, native menus, and revision preview;
- a Next.js for Drupal site that renders landing pages in the View-tab iframe;
- cache-tag revalidation for landing-page changes;
- viewer and previewer roles for OAuth clients; and
- a `/homepage` demo page with a native main-menu link.

Next.js for Drupal sends saved View-tab revisions through its short-lived signed
Draft Mode URL. The connector validates that URL with Drupal and loads the
requested revision through GraphQL. GraphQL Compose Preview separately sends
unsaved form previews with their UUID and token; the connector validates that
pair through the GraphQL `preview` query. Both flows use `/api/draft` before
redirecting the iframe to the page's canonical path.

Update the Next Hydra site under `/admin/config/services/next` when the frontend
does not run at `http://localhost:3001`. Set `GRAPHQL_COMPOSE_PREVIEW_URL` for
the unsaved-preview formatter, preserving its `[node:preview:uuid]` and
`[node:preview:token]` placeholders.

The recipe leaves the revalidation secret empty. `ddev install` generates one,
stores it on the Drupal site, and prints the matching
`CMS_REVALIDATION_SECRET` for `apps/web/.env.local`. Drupal calls the local
frontend through `http://host.docker.internal:3001/api/revalidate` because that
request originates in the DDEV container.

Apply it to a fresh Drupal installation from the web root:

```sh
drush recipe ../recipes/next-hydra-starter -v
```

The demo product collection deliberately has no category ID, so the active
Hydra commerce provider returns an unfiltered product collection.

## Updating the content model

Create fields and bundles through Drupal or Drush, export their configuration,
and add only the dependency-closed configuration to this recipe. After applying
the recipe to a clean site, regenerate the connector schema:

```sh
pnpm --filter @repo/cms-drupal generate
```

Drupal 11.4 can refresh demo content, including referenced media and files, with:

```sh
php core/scripts/drupal content:export node <node-id> \
  --with-dependencies \
  --dir=../recipes/next-hydra-starter/content
```
