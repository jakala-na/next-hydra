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
- `article` nodes provide routeable editorial content with a summary, image,
  Basic HTML body, and stable path alias.
- `featured_articles` Paragraphs select ordered Articles for landing-page cards.
- Drupal's native `main` menu is the frontend navigation source.

The recipe includes a `/homepage` demo landing page, a `/resources` landing
page, three equipment guides, and a nested Resources navigation group. The same
Articles are featured on both landing pages to demonstrate dependency-aware
cache revalidation.

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
`http://localhost:3001/api/drupal-preview`. Set Drupal's
`GRAPHQL_COMPOSE_PREVIEW_URL` environment variable to override that formatter
URL, for example:

```dotenv
GRAPHQL_COMPOSE_PREVIEW_URL="https://frontend.example/api/drupal-preview?uuid=[node:preview:uuid]&token=[node:preview:token]"
```

Published Drupal routes and the main menu use Next.js Cache Components. A page
is tagged with its own Drupal entity tag, and Featured Articles blocks add the
tag for each referenced Article. When Drupal content changes, the Next module
sends its entity and list cache tags to `/api/revalidate`; an Article update
therefore refreshes its own route and only the landing pages that feature it.
The local revalidation URL uses
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
