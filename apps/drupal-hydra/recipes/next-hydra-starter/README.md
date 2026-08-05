# Next Hydra Drupal starter recipe

This recipe provisions the Drupal content contract used by `@repo/cms-drupal`:

- one routeable `landing_page` node type;
- `hero` and `dynamic_product_collection` Paragraph bundles;
- Image Media for hero assets;
- GraphQL Compose routes, native menus, and revision preview;
- viewer and previewer roles for OAuth clients; and
- a `/homepage` demo page with a native main-menu link.

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
