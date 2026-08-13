# Whole-provider Add-on customer scenarios

Date: 2026-08-12
Baseline: `f99ee01f` (`feat(create-next-hydra): compose providers and add-ons`)

Status: superseded in part by [ShadCN root targets versus Next Hydra Install Units](06-shadcn-root-targets-vs-install-units.md) and the subsequent move from generated routes to explicit registry files.

Correction: the benchmarks and customer-workspace scenarios below remain useful, but the proposed per-root graph walker was based on package-relative registry targets. Once every item declares its complete workspace-root target, ShadCN can traverse and install the same dependency graph correctly in one root invocation. Provider routes are now ordinary registry files in that graph rather than separately generated metadata. The per-root walker and route generator were discarded before commit.

## Question

Can a Drupal-specific Add-on use `registryDependencies` to bring the complete Drupal Provider baseline into customer `add`, and does the resulting conflict surface justify splitting Drupal into smaller registry items?

## Conclusion

Keep the Drupal Provider whole for now. The exact dependency chain exposed an implementation gap in baseline `f99ee01f`; the corrected implementation addresses it with explicit workspace-root targets and one ShadCN dependency-graph installation.

`registryDependencies` is still the right relationship to declare. It can connect the Add-on to the Provider and the Provider to its Backend App. However, ShadCN's two public APIs each lose something Next Hydra needs:

- `getRegistryItems()` preserves individual items but fetches only the references passed to it.
- `resolveRegistryItems()` and raw ShadCN `add` follow `registryDependencies`, but flatten all files into one artifact and one installation root.

The original experiment concluded that Next Hydra needed its own graph walk. That conclusion was wrong: the flattened tree preserves each declared `target`; the old targets simply omitted their package/application prefixes. Next Hydra still inspects the resolved graph for customer conflicts and metadata, but delegates installation and dependency traversal to ShadCN.

The whole Provider remains cheap to inspect. The real product risk is that intentional customer cleanup appears as missing prerequisites and is proposed for restoration. Make that restoration visible and confirmable before considering a `core`/`starter` split.

## Exact dependency graph tested

The experiment used the real Drupal registry artifacts and one one-file DAM Add-on. The counts shown here now include the six route files added to `cms-drupal`:

```text
dam-addon (1 file)
  registryDependencies -> cms-drupal (81 files)
    registryDependencies -> drupal (126 files)
```

At baseline, the production `cms-drupal` item did not declare the `drupal` edge, so the experiment added that edge to a temporary copy of the real artifact. The follow-up implementation now declares it in the source registry.

The Drupal Provider's six application routes are explicit ShadCN registry files. Four separate Binary Assets remain Next Hydra metadata and cannot be materialized by `registryDependencies` alone.

## What the ShadCN APIs actually did

The installed and tested dependency is ShadCN 4.16.2.

| Operation | Observed result |
| --- | --- |
| `getRegistryItems([damAddon])` | Returned only `dam-addon`, with one file |
| `resolveRegistryItems([damAddon])` | Followed both dependency edges and returned one anonymous, flattened artifact with 208 files |
| Raw `addRegistryItems([damAddon])` at the workspace root | Wrote the Add-on, CMS package, and Backend App files at that one root |
| A small public-API graph walk using `getRegistryItems()` | Returned the three intact items with 1, 81, and 126 files |

With the package-relative targets used by the original experiment, raw ShadCN produced `auth.ts`, `composer.json`, and `integrations/dam.ts` as workspace-root files. It did not produce `packages/cms-drupal/auth.ts` or `apps/drupal/composer.json`. This result demonstrated that those targets were wrong; complete root-relative targets subsequently removed any need for an Install Unit dispatcher.

## Baseline `create-next-hydra add` result

The same real dependency chain was installed through the baseline `addRegistryItem()` implementation. A Drupal-shaped Customer Workspace was seeded from the real Provider artifacts, then altered one case at a time.

| Scenario | Expected from whole-Provider dependency | Current result |
| --- | --- | --- |
| Delete `packages/cms-drupal/auth.ts` | Recreate it | Not recreated |
| Delete `apps/drupal/composer.json` | Recreate it | Not recreated |
| Delete the Canvas components route | Recreate it | Not recreated |
| Modify `packages/cms-drupal/auth.ts` | Report a changed prerequisite and require review | Change not inspected; Add-on succeeds |

The reason was concrete: baseline `addRegistryItem()` called `getRegistryItems()` once. The returned array contained only the requested Add-on, so the Provider dependency was never inspected or installed. The baseline CLI's `Assumes selections` output was informational only.

## Provider surface and comparison benchmark

The intended whole-Provider preflight expands to:

| Contribution | Targets |
| --- | ---: |
| `packages/cms-drupal` registry files, including routes | 81 |
| `apps/drupal` registry files | 126 |
| Binary Assets | 4 |
| Total Provider targets | 211 |

The following benchmark measures the intended expanded preflight, not baseline `add`. It loaded the real two Provider artifacts, read the four assets, and compared all 211 targets concurrently. The route files were separate generated inputs when the benchmark was recorded; moving the same contents into the Provider registry does not change the compared targets or the conclusions. Each result is based on 30 warmed local-filesystem comparisons and excludes dependency installation.

Environment:

- Node.js 24.16.0
- ShadCN 4.16.2
- local Source Registry and warmed filesystem cache
- no registry network request or package-manager operation inside the comparison benchmark

| Customer Workspace scenario | Missing | Modified | Median | p95 | Customer effect after graph support exists |
| --- | ---: | ---: | ---: | ---: | --- |
| Pristine Drupal scaffold | 0 | 0 | 23.036 ms | 29.000 ms | Skip every Provider target as identical |
| Deleted node-preview route | 1 | 0 | 23.588 ms | 29.059 ms | Disclose and offer to recreate the route |
| Removed starter frontend components, pages, and blocks | 20 | 0 | 23.557 ms | 28.710 ms | Treat 20 intentional deletions as missing prerequisites |
| Heavy cleanup of starter recipe, examples, tests, mocks, scripts, and docs | 133 | 0 | 23.563 ms | 29.816 ms | Propose a large and probably surprising restoration |
| Routine manifest and lockfile churn | 0 | 3 | 24.141 ms | 28.369 ms | Report conflicts for `package.json`, `composer.json`, and `composer.lock` |
| Ten customized Provider files plus one customized route | 0 | 11 | 22.041 ms | 29.374 ms | Require explicit review or manual reconciliation |

Local Source Registry loading for the two Drupal registry items took 17.979 ms median and 22.145 ms p95. Hosted or private registry latency was not measured.

The network-enabled scaffold E2E suite remained dominated by dependency installation:

| E2E path | Duration |
| --- | ---: |
| Contentstack and Drupal scaffold reconstruction | 169.446 s |
| Compatible cross-workspace Drupal/Commerce Add-on plus incompatible preflight | 55.774 s |
| Preserved failed scaffold | 1.599 s |
| Complete three-test suite | 234.75 s |

Provider comparison is not a meaningful contributor to installation time.

## Potential customer-workspace issues

### Intentional deletions look like prerequisites to restore

The Provider dependency does not prove that every missing file is still wanted. Twenty removed starter files is plausible; 133 missing files is plausible after aggressive customer cleanup. `--yes` alone must not silently turn a Provider dependency into a surprising bulk restoration. An explicit `--overwrite` may authorize disclosed replacements, and combining it with `--yes` intentionally makes the operation non-interactive. The CLI should group Provider prerequisite changes separately and disclose their counts before writing.

This is a presentation and confirmation problem first, not evidence that the Provider must be split now.

### Whole-file manifests are noisy

The Provider registries contain complete `package.json`, `composer.json`, and `composer.lock` files. Routine customer maintenance makes these differ byte for byte. They must remain explicit conflicts; the first version can tell the developer to reconcile them manually.

If this becomes routine with real Add-ons, narrow structural checks for a few essential manifest entries are a smaller remedy than splitting every Provider source category.

### Routes fit the ShadCN graph

The six routes are files in the Drupal Provider's ShadCN artifact. Dependency resolution therefore includes them in the same missing, identical, and changed-file preflight as the rest of the Provider. Raw ShadCN can materialize them; the Next Hydra wrapper remains necessary for compatibility checks, package-specific changes, and customer confirmation policy.

### Binary Assets prevent a literally complete ShadCN-only dependency

The four separate assets are not carried by a resolved ShadCN registry item. The three text patch files could become ordinary root-targeted registry files if customer `add` must repair them. The WebP hero cannot be represented as ordinary UTF-8 registry file content.

For v1, either define the hero as scaffold-only sample content and say so, or add a separate binary download mechanism. Until that decision is made, `registryDependencies` can bring the complete code Provider baseline, but not literally every target in the scaffolded Drupal Provider.

### Compatibility and dependency installation are separate checks

The Add-on still needs `compatibility.requires: ["next-hydra/cms/drupal"]`. The Provider dependency says what prerequisite code to inspect and install; compatibility says whether the Customer Workspace is using Drupal. Both are required. A Contentstack workspace must be rejected before the Provider or Add-on writes anything.

## Follow-up implementation status

The corrected working tree keeps Drupal whole and makes the declared graph executable:

1. `cms-drupal` declares `drupal` as a `registryDependency`.
2. Every registry file declares its final workspace-root target.
3. Customer `add` resolves the graph for preflight and delegates one root installation to ShadCN.
4. Required Providers are checked through their stable package aliases before any write.
5. Provider route files participate in the same create, identical, and changed preflight as every other registry file.
6. `--yes` alone refuses changed customer files and dependencies; `--yes --overwrite` applies every disclosed replacement non-interactively.
7. Separate binary assets and pnpm patches remain unsupported in customer `add` v1 because external registry artifacts do not carry those typed contributions.

The focused scaffold E2E proves that a Drupal-and-Commercetools Add-on fixture brings the complete Drupal package and Backend App graph, writes both final roots, applies its package-specific dependency, and rejects Contentstack before creating the destination.

Do not split Drupal yet. Revisit a coarse split only after the real whole-Provider flow exists and repeated Add-on installs show that its restoration proposals are unmanageable.
