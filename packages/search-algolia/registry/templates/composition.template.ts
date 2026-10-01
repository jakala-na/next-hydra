import type { ContentSearchProjectionFactory } from "@repo/search/content-search-projection";

import { createAlgoliaSearchProviderFromEnvironment } from "./provider";
/*{% echo imports %}*/

export const createSearchProvider = (options: {
  readonly contentProjection: ContentSearchProjectionFactory;
}) =>
  createAlgoliaSearchProviderFromEnvironment({
    ...options,
    /*{% if enabled.products %}*/
    /*{% echo slots.products | prepend: 'additionalStrategies: ' | append: ',' %}*/
    /*{% endif %}*/
  });
