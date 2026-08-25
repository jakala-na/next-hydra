# Latest Articles Canvas element

## Summary

- **Design source:** Prompt / prose
- **Scope:** Single Canvas component
- **Version / date:** 2026-08-14

## Assumptions and open questions

- The existing Article content type, teaser fields, routes, and shared article-card presentation remain the source of truth. Risk: low.
- The block defaults to three cards and allows editors to select three, six, or nine. Risk: low.
- No visual reference was supplied, so the existing Article Collection layout and responsive breakpoints are reused. Risk: low.
- Published GraphQL results are the intended content source; draft-only Articles are excluded. Risk: medium.
- An empty result keeps the authored heading and the collection grid footprint visible. Risk: low.

## Region map

| Region | Purpose | Class |
| --- | --- | --- |
| Latest Articles | Introduce and render the newest published Articles | content |

## Component inventory

| machineName (candidate) | Responsibility | Reuse | Parent region | Notes |
| --- | --- | --- | --- | --- |
| `latest-articles` | Own Canvas settings, query Drupal, and compose the shared article collection | 1+ | Latest Articles | Reuses `ArticleCollectionLayout` and `ArticleCard`; queried results are not authorable child elements |

## Component tree

- `latest-articles` (server block adapter)
  - `ArticleCollectionLayout` (shared layout)
    - Suspense loading state
    - `ArticleCard` for each GraphQL result (shared content leaf)

## API sketch

### `latest-articles`

**Implementation style:** granular props — authored copy and result count are independent controls, with no visual preset bundle.

| Name | Purpose | Required? | Kind |
| --- | --- | --- | --- |
| `title` | Section heading | yes | string |
| `description` | Optional introductory copy | no | string |
| `limit` | Maximum number of latest Articles | no | enum integer: 3, 6, or 9 |

**Slots:** none. The repeated cards are live Drupal query results rather than editor-composed rich children.

## Granularity audit

| Component / node | Pass/Fail | Notes |
| --- | --- | --- |
| `latest-articles` | Pass | One cohesive data-backed block with three editor controls; presentation is delegated to shared design-system components |
| `ArticleCollectionLayout` | Pass | Existing reusable layout owner |
| `ArticleCard` | Pass | Existing reusable repeated content leaf |

## Next steps

- [x] `canvas-component-composability` — confirm queried repeatable content does not need a Canvas slot
- [x] `canvas-component-metadata` — define the editor contract
- [x] `canvas-component-definition` — add folder, implementation, and mock coverage
- [ ] Verify the live GraphQL result and Workbench preview when the local Drupal/Docker runtime is available
