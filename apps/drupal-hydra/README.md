# Drupal Hydra

Drupal 11 backend for the Next Hydra Drupal CMS connector. The backend owns a
small content contract that matches the blocks implemented by `@repo/cms-drupal`.

## Install

With a Docker provider running:

```sh
ddev install
```

The command installs Drupal with the minimal profile, applies the local
`recipes/next-hydra-starter` recipe, generates OAuth scopes and consumers, and
prints the viewer and previewer credentials required by the connector. It also
prints `CMS_REVALIDATION_SECRET`; copy that value into `apps/web/.env.local`.

## Hydra content model

- `landing_page` nodes are routeable pages composed from ordered Paragraphs.
- `hero` Paragraphs provide a tagline, heading, description, image, and actions.
- `dynamic_product_collection` Paragraphs provide an optional external commerce
  category ID. An empty category returns products without a category filter.
- Drupal's native `main` menu is the frontend navigation source.

The recipe includes a `/homepage` demo landing page with both supported blocks,
a Hydra hero image, and a native Home menu link. It configures GraphQL Compose to
expose only this content contract.

## Local development

```sh
ddev start
ddev drush cache:rebuild
```

Next.js for Drupal 2.1 renders the saved landing-page revision in an iframe on
Drupal's View tab. Its configured site and draft URLs default to
`http://localhost:3001`; update the Next Hydra site at
`/admin/config/services/next` in another environment.

GraphQL Compose Preview separately renders unsaved form previews through
`http://localhost:3001/api/draft`. Set Drupal's
`GRAPHQL_COMPOSE_PREVIEW_URL` environment variable to override that formatter
URL, for example:

```dotenv
GRAPHQL_COMPOSE_PREVIEW_URL="https://frontend.example/api/draft?uuid=[node:preview:uuid]&token=[node:preview:token]"
```

Published landing pages and the main menu use Next.js Cache Components. When a
landing page changes, Drupal's Next module sends its entity and list cache tags
to `/api/revalidate`. The local revalidation URL uses
`host.docker.internal:3001` because the request originates inside DDEV; preview
URLs use `localhost:3001` because the browser opens them on the host.

In another environment, update both the revalidation URL and secret on the Next
Hydra site under `/admin/config/services/next`.

After changing the Drupal content model, export only its dependency-closed
configuration back into `recipes/next-hydra-starter/config`. Refresh the
connector schema from the monorepo root:

```sh
pnpm --filter @repo/cms-drupal generate
```

Drupal recipes are applied once. Validate recipe changes against a fresh Drupal
installation rather than expecting them to remove configuration from an existing
database.
