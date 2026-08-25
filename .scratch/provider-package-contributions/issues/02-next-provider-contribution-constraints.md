# Next.js provider contribution constraints

Type: research
Status: resolved
Blocked by: None

## Question

Using primary Next.js, pnpm, Node package, and relevant framework source or documentation, determine the viable mechanisms for an installed provider package to contribute application behavior that normally requires physical files or application configuration.

Cover at least:

- App Router route-handler discovery and whether route files can be supplied, generated, re-exported, rewritten, or dispatched from packages;
- build-time `next.config.ts`, environment-schema, TypeScript, test-runner, and Turbopack alias composition;
- workspace and published-package alias resolution before Next compilation;
- deterministic generation into a developer workspace without tracked-file churn;
- development and production build lifecycle hooks, stale artifact detection, and failure behavior; and
- route or configuration collisions when CMS and Commerce providers contribute independently.

Evaluate the current Drupal and Contentstack route shapes in this checkout as concrete scenarios. Produce a constrained option set for the later architecture decision; do not choose based on preference where the evidence cannot distinguish the options.

## Research output

Write the cited findings to `../research/02-next-provider-contribution-constraints.md`.

## Answer

The cited findings are recorded in [Next.js provider contribution constraints](../research/02-next-provider-contribution-constraints.md).

Installing a package cannot directly register an App Router endpoint: Next.js discovers physical `route.ts` or `route.js` entries only under the application's `app` directory. Provider packages can own handler implementations, but application composition must supply generated route shims, a stable dispatcher, or rewrites targeting such a dispatcher.

pnpm workspace and registry aliases preserve stable import names, but changing the selected alias mutates dependency and lockfile state. A clean maintainer switch therefore requires all compared providers to be installed under their real names plus an ignored selector or generated bridge. Scaffolded projects may still install only their chosen provider under a stable alias.

The contribution problem also spans `next.config`, environment schemas, TypeScript configuration, Vitest aliases, proxies, and Commerce composition roots. Published manifest and Next-config entrypoints must ship Node-executable JavaScript. Any generated-adapter design must own deterministic cleanup, collision checks, digests, drift validation, and invocation before every relevant Next, test, and typecheck command.

The viable set is now constrained to generated application adapters, a stable application dispatcher, tracked scaffold-time provisioning, or a deliberate split between simple scaffold output and richer maintainer-workspace switching. The framework evidence does not choose among generated adapters and a dispatcher; that requires a concrete prototype against the current Drupal and Contentstack routes.
