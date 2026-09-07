import type { ContentSearchProjectionFactory } from "@repo/search/content-search-projection";

import { createAlgoliaSearchProviderFromEnvironment } from "./provider";

export const createSearchProvider = (options: {
  readonly contentProjection: ContentSearchProjectionFactory;
}) => createAlgoliaSearchProviderFromEnvironment(options);
