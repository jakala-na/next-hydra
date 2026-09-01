# End-to-end tests

This workspace package discovers product-neutral BDD features, steps, and drivers collocated with their domain packages. It owns only Playwright configuration and execution.

## Run against a composition

Configure each application with the same runtime files it normally uses. Next's normal development environment resolution is preserved, including `.env` and `.env.local`:

- `apps/web` contains the customer web runtime values.
- `apps/api` contains the consumer API values and the admin identity verification values.
- `apps/admin` contains the isolated admin runtime values using the same generic provider names the admin app normally consumes.

Start the workspace with `pnpm dev`, then run `pnpm test:e2e`. Locally, Playwright asks Portless for this checkout's web, API, and admin origins. That preserves worktree prefixes and the proxy's configured HTTPS port while keeping the applications in the same long-lived development composition you already use. Playwright verifies all three applications are available but does not start or stop them.

Install the Chromium binary once on a new machine with `pnpm --filter @repo/e2e exec playwright install chromium`.

`E2E_WEB_URL`, `E2E_API_URL`, and `E2E_ADMIN_URL` take precedence over the discovered local or CI origins without duplicating provider credentials in the test runner. Locally, overridden servers must already be running. `E2E_RUN_ID` may be set by CI to make generated resources identifiable. The runner creates a unique run ID when it is omitted. `E2E_STORE_KEY`, `WORKOS_COOKIE_NAME`, `COMPANY_MEMBER_INVITATION_CONTAINER`, and `REGISTRATION_CONTAINER` are optional and default to the application defaults. Authorized test users receive a dedicated E2E role derived from the permissions requested by the scenario; the provider adapter idempotently creates or repairs that role before sign-in.

The default `page` fixture targets the customer web app. The composition also exposes an isolated `adminPage` and an `apiRequest` context rooted at the resolved admin and API origins. The shared auth context remembers which application owns each identity, so the same `I log in as` step selects the customer or admin provider control without leaking either application's credentials into the other.

Locally, each app loads its own environment through its normal `pnpm dev` process. CI is reserved for manually dispatched production regressions from `main`. It waits for the web, API, and admin Vercel production deployments at the selected commit, then uses `E2E_WEB_URL`, `E2E_API_URL`, and `E2E_ADMIN_URL` without starting application servers. The GitHub runner receives only the provider values needed to provision and clean up scenarios; application runtime values remain in Vercel.

For CI, provide the customer auth provider under its normal runtime names and the isolated admin provider under `ADMIN_WORKOS_*` or `ADMIN_CLERK_*`. Configure the stable production URLs as `E2E_WEB_URL`, `E2E_API_URL`, and `E2E_ADMIN_URL` in the `e2e` GitHub Environment. Configure `VERCEL_WEB_PROJECT_SLUG`, `VERCEL_API_PROJECT_SLUG`, and `VERCEL_ADMIN_PROJECT_SLUG` there as well so the workflow can wait for the exact `main` deployment. The workflow serializes runs and does not cancel an active run, allowing fixture cleanup to complete against the shared demo environment.

All three applications must be connected to Vercel as separate projects rooted at `apps/web`, `apps/api`, and `apps/admin`. The current project slugs belong in the GitHub Environment rather than this repository so project renames do not require a code change.

The registration fixture asks the selected auth provider to create a verified identity and sign that identity into the scenario's isolated page. WorkOS authenticates the provisioned password user and installs its sealed session cookie. Clerk creates one testing token and backend client per customer or admin Layer, then installs that token only in the matching browser context before completing ticket sign-in. This realm-scoped setup is necessary because Clerk's process-global helper state can represent only one Clerk application at a time. Both implementations expose the same `AuthTestControl` Effect service. Teardown revokes tracked pending invitations, deletes their stored invitation records, deletes the real Commercetools Business Unit and its direct Customers, and finally deletes the provider identities. Cleanup remains safe when a provider resource is already absent.

Features and steps remain in the domain package that owns the behavior. Provider-specific setup and janitors remain in provider packages; the runner's `composition.ts` is the one place that selects the real implementations. Its direct workspace dependencies make the E2E package affected when registration, commerce, either selected provider, any of the three applications, or their transitive dependencies change.

Playwright transforms the test entrypoints themselves. The live provider graph is loaded separately through a scoped Jiti instance because those workspace packages contain mixed ESM/CommonJS and bundler-oriented TypeScript imports that native Node loading does not accept. Keeping that loader scoped to the provider imports avoids changing Playwright's process-wide module semantics.

`@repo/e2e` declares workspace dependencies on the composed web, API, and admin applications and the domains it discovers. Once the lockfile is current, `turbo run e2e --affected` therefore selects this runner when those packages or their dependencies change.

Use `pnpm test:e2e` to run the suite unconditionally and `pnpm test:e2e:affected` for a local affected run. GitHub Actions runs the complete regression suite on demand against the deployed demo. Feature tags remain available for focused local diagnosis.

## Authoring loop

1. Add one scenario under an owning domain's scoped `e2e/@domain` directory.
2. Run `pnpm --filter @repo/e2e e2e:generate` and observe the undefined-step red.
3. Add thin bindings beside the scoped feature and browser automation under `e2e/drivers`.
4. Run the scenario against Chromium, then implement the product behavior and repeat until green.

Feature wording describes domain behavior. Steps translate that vocabulary to drivers. Drivers own routes, accessible locators, and Playwright assertions. Shared fixtures belong in `@repo/e2e-testing` only when more than one domain needs them.
