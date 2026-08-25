# Next Hydra Drupal starter recipe

This recipe provisions the Drupal content contract used by `@repo/cms-drupal`:

- routeable `landing_page` and `article` node types;
- `hero`, `dynamic_product_collection`, and `featured_articles` Paragraph bundles;
- Image Media for hero assets;
- CKEditor 5 with Drupal's Basic HTML toolbar for Article bodies;
- GraphQL Compose routes, native menus, and revision preview;
- regional languages and content translation for Drupal and Canvas;
- Canvas Translate for Canvas pages, content templates, and page regions;
- preinstalled Hero, Product Collection, Featured Articles, Article Card, and Text external Canvas component definitions;
- a Next.js for Drupal site that renders landing pages in the View-tab iframe;
- cache-tag revalidation for pages and their referenced article dependencies;
- viewer and previewer roles for OAuth clients;
- a public PKCE OAuth client (`client_id=cli`) for Canvas CLI and Workbench browser login; and
- translated regular and Canvas demo homepages, a resource center, articles, and nested native navigation.

Next.js for Drupal sends saved View-tab revisions through its short-lived signed Draft Mode URL. The connector validates that URL with Drupal and loads the requested revision through GraphQL. GraphQL Compose Preview separately sends unsaved form previews with their UUID and token; the connector validates that pair through the GraphQL `preview` query. Both flows use `/api/drupal-preview` before redirecting the iframe to the page's canonical path.

Update the Next Hydra site under `/admin/config/services/next` when the frontend does not run at `http://localhost:3001`. Set `GRAPHQL_COMPOSE_PREVIEW_URL` for the unsaved-preview formatter, preserving its `[node:preview:uuid]` and `[node:preview:token]` placeholders and the `langcode=[node:langcode]` query parameter.

## Languages and translations

The recipe uses Drupal's standard catalogue IDs (`en`, `en-gb`, `es`, `fr`, `de`, `it`, `pt-pt`, and `nl`) while retaining the frontend's regional URL prefixes (`/en-GB`, `/es-ES`, `/fr-FR`, and so on). Landing pages, Articles, Paragraph text, menu links, Image Media, and Canvas pages are translation-enabled. Structural references such as the product category ID and hero image remain shared across translations.

Canvas Translate adds a translation workspace at `/canvas/app/canvas_translate`. It translates Canvas page component values as content translations and stores translated content-template and page-region values as language-specific configuration overrides. The module is currently an alpha dependency, so review its release status before a production upgrade. Administrators can access the workspace; grant its restricted `translate canvas content` permission deliberately when creating a dedicated translator role.

The recipe also enables the headless theme's `pre_header`, `post_header`, `pre_footer`, and `post_footer` Canvas PageRegions. Each region contains a small text component after installation so the complete global-region delivery path can be verified at `/canvas/regions-api`; replace these markers with the site's authored global content.

Canvas page translations share component-tree structure while retaining independently translatable component inputs. Structural edits such as adding, removing, or reordering a component therefore remain symmetrical across languages without overwriting translated component copy.

The recipe preinstalls the external Canvas component definitions used by its default Canvas homepage and their corresponding derived `canvas.component.js.*` records. Recipe config synchronization suppresses Canvas component discovery, so both layers are included explicitly and a clean install does not require an initial component push. Run the package's `canvas:push` command after changing local component metadata to update Drupal. The Canvas parametrized-width image style is included explicitly so components with image entity-reference props can calculate their dependencies during the same clean recipe installation.

The Canvas demo homepage mirrors the regular homepage's Hero, Product Collection, and Featured Articles blocks. Featured Articles composes Article Card children through its `articles` slot, and each card selects an Article content entity.

The frontend sends the requested Drupal langcode explicitly for GraphQL routes, menus, and previews. Canvas requests use Drupal's localized path. A translation therefore cannot reuse another locale's cached route or menu result.

The recipe leaves the revalidation secret empty. `ddev install` generates one, stores it on the Drupal site, and prints the matching `CMS_REVALIDATION_SECRET` for `apps/web/.env.local`. Drupal calls the local frontend through `http://host.docker.internal:3001/api/revalidate` because that request originates in the DDEV container.

Apply it to a fresh Drupal installation from the web root:

```sh
drush recipe ../recipes/next-hydra-starter -v
```

The demo product collection deliberately has no category ID, so the active Hydra commerce provider returns an unfiltered product collection.

The regular homepage, Canvas homepage, and `/resources` page reference the same three demo Articles. Their Featured Articles blocks expose every referenced `node:{id}` dependency through Drupal cacheability. Editing one Article therefore refreshes its Article route and each cached page that embeds it, without invalidating unrelated pages. Canvas page changes likewise invalidate the matching `canvas_page:{id}` frontend cache entry.

## Updating the content model

Create fields and bundles through Drupal or Drush, export their configuration, and add only the dependency-closed configuration to this recipe. After applying the recipe to a clean site, regenerate the connector schema:

```sh
pnpm --filter @repo/cms-drupal generate
```

Drupal 11.4 can refresh demo content, including referenced media and files, with:

```sh
php core/scripts/drupal content:export node <node-id> \
  --with-dependencies \
  --dir=../recipes/next-hydra-starter/content
```

Core's exporter does not currently emit portable embedded values for `entity_reference_revisions` fields. Keep Paragraphs embedded under the parent node's `field_components` values, as the demo landing pages do, rather than committing exported numeric Paragraph IDs.
