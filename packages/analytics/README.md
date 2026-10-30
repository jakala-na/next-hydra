# Analytics setup

PostHog is included in the application's analytics provider. Its current environment validation requires `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`.

Set the project key and host for your PostHog project in the web application's environment before starting it. Copy the values from your project settings; do not use a personal API key in the public project-key variable. Restart development or redeploy after changing application environment values.

`NEXT_PUBLIC_GA_MEASUREMENT_ID` is optional. The Google Analytics component is only rendered when that value is configured. The analytics provider also includes Vercel Analytics.

Composition displays these configuration steps; it does not create a PostHog project or configure the external service.
