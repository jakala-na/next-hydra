# Web composition

One shared web application is maintained and materialized. CMS is required. Auth is optional. Commerce requires Auth and installs the entire existing Commerce package; guest checkout is still a runtime journey, not a separate Auth-free installation.

The source checkout owns modules, templates and registry metadata. Named development workspaces exercise selections without changing that checkout. Both initial scaffolding and `compose` resolve the same implicit `app-web` registry item. There is no public app/profile selector and no separate content-only, site-shell, or catalog application.

## Ownership

| Owner | Installed source and recipes |
| --- | --- |
| Web | CMS routes, document/layout, environment and Next configuration templates |
| Auth provider | Provider implementation and sign-in routes; `auth-web` adds account controls, provider wrapper, proxy and keys |
| Commerce | Whole core package; `commerce-web` installs product, checkout, confirmation, account and registration routes and the full runtime |
| Commerce | `commerce-api` installs Checkout, Address Book and Registration; `commerce-admin` installs registration review |
| CMS + Commerce | `cms-contentstack-commerce` or `cms-drupal-commerce` connects the selected CMS to core Commerce through provider-local product-collection mapping and CMS recipe/schema integration |
| Navigation search | Header search independent of Commerce |
| Workspace CLI | CMS administration plus Auth and Commerce commands when selected |

`commerce-web`, `commerce-api` and `commerce-admin` are composition recipes installed as registry dependencies of Commerce, not selectable portions of Commerce. API source is copied directly and needs no composition template.

Checkout remains ordinary source in `app/[locale]/checkout/page.tsx`, delegating to `@repo/commerce/checkout`. It is copied byte-for-byte into the selected workspace. It is never assembled from fragments.

## Shared files

`registry/templates/layout.tsx.template` owns the shared header structure. Auth supplies account controls; Commerce supplies its provider, cart and business-unit controls; navigation search supplies search. The document frame, environment, proxy and Next configuration use the same module-reference mechanism. Account links receive Commerce destinations only with Commerce.

Templates describe structure; recipes use `meta.composition.slotBindings` to place ordinary TS/TSX module exports into their named slots. Customer output has ordinary filenames, imports and functions, no runtime registry and no continuing generation step. Composed files exist only in materialized workspaces, not as duplicate root source. Tests render all four committed definitions into fresh physical workspaces and check their physical output against the templates. Provider routes likewise live only at their canonical registry paths until materialization.

## Local workspaces

From the repository root:

```sh
pnpm --filter create-next-hydra compose cms-contentstack --copy-env

pnpm --filter create-next-hydra compose storefront-drupal --copy-env
pnpm --filter create-next-hydra compose --all
pnpm --filter create-next-hydra compose cms-contentstack --watch
pnpm --filter create-next-hydra compose cms-contentstack --explain 'apps/web/app/[locale]/layout.tsx'
pnpm --filter create-next-hydra compose storefront-contentstack --run test
```

Each named definition has its own manifests, dependencies and lockfile. All application files are physical copies. Use `compose <name> --explain <workspace-relative-file>` to locate the canonical implementation or template, edit there, then refresh the workspace. Repeating the command safely refreshes it; unchanged dependency inputs do not trigger installation. `--copy-env` copies only missing env files without printing values. See [Named workspaces](../../workspaces/README.md) for definitions and local ports.

Before application tests or browser verification, require `compose <name> --check` to pass and verify that the server uses that workspace. `--diff` diagnoses local output edits against the last composition snapshot; it does not detect source changes that have not been copied yet. The [agent verification guidance](../../AGENTS.md#source-and-application-verification) distinguishes source tests, application tests and browser checks.

Run `pnpm dev` inside the output, or `pnpm --filter web dev` for web alone. When overriding the dev server's hostname, use `localhost`: binding explicitly to `127.0.0.1` can cause default-locale rewrites to cross origins and redirect back to themselves.

New files created in an ignored output are reported by `compose --check` and are never deleted or automatically adopted. Reconcile them into canonical source and registry ownership before discarding that output. Locally modified composed files block refresh until reconciled. `registry:sync` refreshes complete package inventories; app recipes such as `commerce-web` keep explicit ownership. Run registry checks, composition tests, and a fresh copied scaffold after changing ownership or templates.
