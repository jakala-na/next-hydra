# Clerk setup

## Customer application

Create a Clerk application for `apps/web`. Configure its `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, sign-in paths and `CLERK_AUTHORIZED_PARTIES` for its actual origin. Keep session cookies host-only. Provider keys and exact requirements are declared in `keys.ts`.

## Commerce administration and webhooks

Complete this section only when Commerce is selected. That composition includes `apps/admin`, `apps/api` and the customer webhook route.

Create a separate Clerk application for `apps/admin` with its own credentials and host-only cookies. Do not configure the admin host as a satellite of the customer application. The API uses the admin application's `ADMIN_CLERK_*` credentials and `ADMIN_CLERK_AUTHORIZED_PARTIES` to verify reviewer access.

From the project root, register the customer webhook using the customer `CLERK_SECRET_KEY`:

```sh
pnpm --filter cli cli auth provision \
  --api-url <public-api-url> --output auth.env
```

Replace the placeholder before running the command. Relative output paths resolve in `apps/cli`. Configure the returned signing secret in the API application's environment. The endpoint is create-only; an exact managed endpoint can be read on rerun to recover its secret.

For Vercel publication use `--store vercel` and repeat `--environment` for the required deployment environments. The command checks the linked API project and publishes the webhook signing secret there. Existing variables require explicit `--overwrite`; redeploy after publication.
