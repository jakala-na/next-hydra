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
prints the viewer and previewer credentials required by the connector.

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

The recipe sends preview URLs to `http://localhost:3001`, matching the default
Next Hydra web application URL.

After changing the Drupal content model, export only its dependency-closed
configuration back into `recipes/next-hydra-starter/config`. Refresh the
connector schema from the monorepo root:

```sh
pnpm --filter @repo/cms-drupal generate
```

Drupal recipes are applied once. Validate recipe changes against a fresh Drupal
installation rather than expecting them to remove configuration from an existing
database.
