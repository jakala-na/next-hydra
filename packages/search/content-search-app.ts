/**
 * CMS composition contract for installing the provider's content search app.
 *
 * Only some CMS providers ship a search-indexing app (Contentstack's Algolia
 * app); providers without one (Drupal) simply omit the hook and the search
 * CLI falls back to their manual indexing handoff.
 */
export interface InstallContentSearchAppOptions {
  /** Content index name provisioned by the search provider. */
  readonly indexName: string;
}

export type ContentSearchAppStatus = "installed" | "updated";

export interface InstalledContentSearchApp {
  readonly environment: string;
  readonly indexName: string;
  readonly installationUid: string;
  readonly status: ContentSearchAppStatus;
}
