# Verifying workspace browser tests

Customer and named Development Workspaces receive the same `tests/e2e` runner through composition. Its scenarios, dependencies and fixtures follow the selected registry graph. CMS-only projects receive a web-only runner; commerce adds its provider fixtures and company-login scenarios. There are currently no CMS browser scenarios, so an empty CMS suite is reported as zero tests rather than browser coverage.

Canonical runner files and its registry are under `tests/e2e`. Composed `composition.ts` and `global.setup.ts` come from the templates there. Edit canonical files or templates, then refresh. See [the project guide](../../tests/e2e/README.md) for customer-facing commands and authoring.

## Maintainer entry points

Compose and check the selected workspace first, then run its own `pnpm test:e2e`. Tests and provider fixtures resolve inside that workspace, not the source checkout. Pass Turbo options directly and Playwright arguments after `--`:

```sh
pnpm --dir workspaces/cms-contentstack test:e2e
pnpm --dir workspaces/storefront-contentstack test:e2e --output-logs=full -- --grep 'Anonymous checkout' --workers=1
```

Choose the named workspace explicitly. Application commands neither compose nor install a runner implicitly. A missing workspace script means composition has not supplied that runner; refresh before continuing.

## Freshness before application verification

Before local browser verification, refresh and check the selected workspace:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack
pnpm --filter create-next-hydra compose storefront-contentstack --check
```

Resolve conflicts with `--diff` and source ownership with `--explain <file>`. Verify that the server being tested belongs to this workspace and has loaded the changes. Health checks prove availability, not revision identity.

The delegate currently discovers and invokes runners; it does not enforce freshness automatically. Any future freshness/revision gate belongs in maintainer orchestration. Reuse the composition check's structured result and registry inventory, including uncommitted source inputs. Keep checks uncached and nonmutating. Record the source and materialized revisions used by the run, and invalidate results if they changed; a stable or isolated composition is stronger than checks before and after a moving watcher. Preserve fixture cleanup on failure. Customer runners need no source checkout, named-workspace receipt, or scaffolding dependency.

Deployed regressions must still materialize and install the runner from the commit being verified, then invoke it with explicit deployment URLs. The maintainer GitHub workflow selects the reference storefront and waits for its three matching production deployments; this is deployment policy outside the customer runner.

## Choosing verification

Use existing BDD scenarios for changes spanning customer journeys. Presentation-only work can use component checks and browser inspection. Runner/composition changes need helper tests and checks that customer and named workspaces receive identical runners and selected dependencies; they do not require inventing product scenarios. Report automated E2E runs separately from manual browser checks and test discovery.
