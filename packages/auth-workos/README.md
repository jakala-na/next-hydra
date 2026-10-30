# WorkOS setup

## Customer application

Create a WorkOS project for `apps/web`. Configure its `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD` and `NEXT_PUBLIC_WORKOS_REDIRECT_URI`. Register the application's actual callback URL in WorkOS. Keep session cookies host-only; leave `WORKOS_COOKIE_DOMAIN` unset.

## Commerce administration and webhooks

Complete this section only when Commerce is selected. That composition includes `apps/admin`, `apps/api` and the customer webhook route.

Create a separate WorkOS project for `apps/admin` with its own credentials, cookie password and callback URL. Keep its cookies host-only too. The API uses `ADMIN_WORKOS_API_KEY` and `ADMIN_WORKOS_CLIENT_ID` from the admin project to verify reviewer access.

From the project root, register the customer webhook using the customer `WORKOS_API_KEY`:

```sh
pnpm --filter cli cli auth provision \
  --api-url <public-api-url> --output auth.env
```

Replace the placeholder before running the command. Relative output paths resolve in `apps/cli`. Configure the returned signing secret in the API application's environment. The endpoint is create-only; an exact existing endpoint can be read on rerun to recover its secret.

For Vercel publication use `--store vercel` and repeat `--environment` for the required deployment environments. The command checks the linked API project and publishes the webhook signing secret there. Existing variables require explicit `--overwrite`; redeploy after publication.
