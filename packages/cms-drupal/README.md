# @repo/cms-drupal

Drupal provider for `@repo/cms`.

Supports Canvas, page and content templates, multilingual content and navigation, draft previews, automatic cache revalidation, and optional Commerce integration.

## Setup

Run these commands from an installed workspace with the Drupal provider selected. For development in this repository, first follow [Named workspaces](../../workspaces/README.md).

1. Provision Drupal using DDEV:

   ```bash
   pnpm --filter cli cli cms provision --app-directory ../drupal
   ```

2. Copy the settings from [`.env.example`](.env.example) into the web application's `.env.local`. Set `DRUPAL_BASE_URL` and the viewer and previewer OAuth credentials printed by the installer. Add its `CMS_REVALIDATION_SECRET` to the web environment too.

3. Start the frontend with system certificates enabled for local DDEV HTTPS:

   ```bash
   NODE_OPTIONS=--use-system-ca pnpm --filter web dev
   ```

For schema generation, also put the provider settings in this package's `.env`. Keep credentials out of version control.

For Acquia, set `DRUPAL_FRONTEND_URL` in Drupal's runtime environment and optionally `DRUPAL_REVALIDATE_URL` for an internal callback address. In the frontend deployment, set `DRUPAL_BASE_URL` to Drupal's public URL and `NEXT_PUBLIC_WEB_URL` to the frontend's public URL. See [Acquia setup](../../apps/drupal/README.md#deploy-to-acquia).

## Optional configuration

| Variable | Purpose |
| --- | --- |
| `DRUPAL_AUTH_URI` | Override the default `/oauth/token` endpoint. |
| `DRUPAL_GRAPHQL_URI` | Override the default `/graphql` endpoint. |
| `CANVAS_SITE_URL` | Override the Canvas backend URL; defaults to `DRUPAL_BASE_URL`. |
| `CANVAS_JSONAPI_PREFIX` | JSON:API path fallback when discovery fails; defaults to `/jsonapi`. |
| `FRAME_ANCESTORS` | Additional origins allowed to embed the frontend, alongside the CMS defaults. |
| `CANVAS_EDITOR_ORIGINS` | Replace Drupal's default editor allowlist. Leave unset to keep the default; an empty value removes the provider origins. |

For framing settings, use comma-separated HTTP(S) origins, including ports where needed, without paths or wildcards. Set them in the frontend environment and restart or redeploy after changes.

For unsaved Drupal form previews, set `GRAPHQL_COMPOSE_PREVIEW_URL` in Drupal to the frontend's `/api/drupal-preview` URL. Preserve the preview UUID, token, and language placeholders in the configured URL.

## Development commands

```bash
# Refresh the GraphQL schema and generated types
pnpm --filter @repo/cms-drupal generate

# Preview Canvas components locally
pnpm --filter @repo/cms-drupal canvas:workbench

# Validate and publish Canvas components
pnpm --filter @repo/cms-drupal canvas:validate
pnpm --filter @repo/cms-drupal canvas:push

# Check the provider
pnpm --filter @repo/cms-drupal test
pnpm --filter @repo/cms-drupal typecheck
```

`canvas:push` publishes components only. Edit and publish pages and templates in Drupal Canvas.
