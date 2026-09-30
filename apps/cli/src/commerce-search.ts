import { commerceSearchIndexingSource } from "@repo/commerce-provider/cli";
import { createCommerceSearch } from "@repo/search-provider/cli/commerce";

export const commerceSearch = createCommerceSearch(
  commerceSearchIndexingSource
);
