import { resolveSearchContentTypes } from "./recipe/search/types.ts";
/*{% echo imports %}*/

const contributions = {/*{% echo slots.types %}*/};

export const searchableContentTypes = resolveSearchContentTypes(
  Object.values(contributions)
);
