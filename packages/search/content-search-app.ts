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

/** Mapping fields successfully applied by the CMS app installer. */
export interface ConfiguredContentSearchMapping {
  readonly contentTypeUid: string;
  readonly fields: readonly string[];
}

export interface InstalledContentSearchApp {
  readonly environment: string;
  readonly indexName: string;
  readonly installationUid: string;
  readonly status: ContentSearchAppStatus;
  readonly configuredMappings?: readonly ConfiguredContentSearchMapping[];
}
