# Portless local development

The workspace uses Portless to give each HTTP development server a stable HTTPS origin while assigning its process an available loopback port. Turbo remains the workspace orchestrator.

## First-time setup

Install dependencies, create and trust the local Portless certificate authority, then start the workspace:

```bash
pnpm install
pnpm exec portless trust
pnpm dev
```

Trusting the certificate authority is a machine-level operation and may ask for administrator approval. Installing the optional startup service keeps the HTTPS proxy available after reboot:

```bash
pnpm exec portless service install
```

Use `pnpm exec portless doctor` to diagnose proxy, certificate, DNS, or route problems. `pnpm exec portless list` prints the active local and public routes.

## Application origins

The primary checkout uses these origins, where `<workspace>` is the sanitized root package name:

| Application        | Origin                                    |
| ------------------ | ----------------------------------------- |
| Web                | `https://web.<workspace>.localhost`       |
| API                | `https://api.<workspace>.localhost`       |
| Admin              | `https://admin.<workspace>.localhost`     |
| Docs, when present | `https://docs.<workspace>.localhost`      |
| Email preview      | `https://email.<workspace>.localhost`     |
| Storybook          | `https://storybook.<workspace>.localhost` |

Each package keeps a `dev:app` script that starts its framework directly. Use that script for a focused fallback or noninteractive environment:

```bash
pnpm --filter web dev:app
```

Direct Next.js application scripts use the framework's default port unless `PORT` is supplied, so they are not intended to start the whole workspace together. Build, test, typecheck, and CI tasks do not require the Portless proxy or certificate authority.

## Linked worktrees and environment URLs

Portless prepends the sanitized branch name in linked Git worktrees. For example, a `fix-auth` worktree receives origins shaped like:

```text
https://fix-auth.web.<workspace>.localhost
https://fix-auth.api.<workspace>.localhost
```

When Portless starts web, API, or admin, the application derives its sibling service URLs and auth origins from `PORTLESS_URL`. This keeps the following values in the same worktree automatically:

- `NEXT_PUBLIC_WEB_URL`
- `NEXT_PUBLIC_API_URL`
- `ADMIN_URL`
- WorkOS redirect URIs
- Clerk authorized parties
- `VERCEL_PROJECT_PRODUCTION_URL`

Set `PORTLESS_AUTO_ENV=0` before starting an application only when intentionally preserving explicit `.env.local` or shell URLs, such as testing a local web application against a remote API.

WorkOS and other identity providers still enforce their own redirect allowlists. Register the main web and admin callbacks, and register a worktree callback before exercising auth from that worktree. `pnpm exec portless list` shows the exact current origins.

## Exposing the API through ngrok

Install and authenticate the ngrok CLI once:

```bash
ngrok config add-authtoken <token>
```

For a session that runs the rest of the workspace locally and exposes only the API, use two terminals:

```bash
# Terminal 1
pnpm dev:without-api

# Terminal 2
pnpm dev:api:public
```

Portless prints the temporary public ngrok URL, adds it to `portless list`, and injects it into the API process as `PORTLESS_NGROK_URL`. The local API remains available at its Portless HTTPS origin. The tunnel stops with the API process.

Use the public URL when provisioning a temporary WorkOS or Clerk webhook endpoint, and keep the application's webhook signature verification enabled. The built-in integration creates an ephemeral URL. Use a separately configured ngrok endpoint when a stable domain, Traffic Policy, access restriction, or durable provider registration is required.

Do not set `PORTLESS_NGROK=1` for this workspace: that setting can expose every Portless-managed application rather than only the API.

## DDEV boundary

The Drupal/DDEV preview and revalidation configuration intentionally retains its existing fixed `host.docker.internal:3001` contract. A DDEV container cannot reach Portless's random loopback child port directly. Resolve and validate that container-to-host bridge separately before using Drupal preview or revalidation with the Portless-managed web process.

## Maintenance

Useful commands:

```bash
pnpm exec portless list
pnpm exec portless doctor
pnpm exec portless prune
```

`pnpm exec portless clean` removes Portless-managed machine state, including its local certificate authority and startup service. Treat it as cleanup, not routine troubleshooting.
