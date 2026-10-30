# Optional Sentry setup

The application includes Sentry instrumentation. Its environment variables are optional, so error-reporting setup can be deferred.

To enable reporting, set `NEXT_PUBLIC_SENTRY_DSN` to the DSN from your Sentry project in the application's environment. Restart development or redeploy after changing it, then verify a test event reaches the intended Sentry project.

For source-map uploads, set `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` in the build environment. The auth token is a server-only build credential; never prefix it with `NEXT_PUBLIC_` or expose it to browser code. See `next-config.ts` for the existing upload configuration.

Composition displays this optional guidance in yellow after required setup groups. It does not create a Sentry project, issue credentials or send test events.
