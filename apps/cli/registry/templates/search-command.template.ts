import {
  contentIndexingOperations,
  createContentIndexingHandoff,
  loadContentSearchProjection,
} from "@repo/cms/search";
import { createSearchCommand } from "@repo/search-provider/cli";
import type { ConfigProvider, Effect } from "effect";
/*{% echo imports %}*/

export const createWorkspaceSearchCommand = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  createSearchCommand(configProvider, {
    /*{% if enabled.products %}*/
    /*{% echo slots.products | prepend: 'products: ' | append: ',' %}*/
    /*{% endif %}*/
    content: {
      indexingOperations: contentIndexingOperations,
      createIndexingHandoff: createContentIndexingHandoff,
      createProjection: loadContentSearchProjection,
      /*{% if enabled.contentSearchApp %}*/
      /*{% echo slots.contentSearchApp | prepend: 'installContentSearchApp: ' | append: ',' %}*/
      /*{% endif %}*/
    },
  });
