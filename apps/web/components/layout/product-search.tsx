import { getLocale } from "@repo/i18n";
import { SearchAutocomplete } from "@repo/search/autocomplete";
import { searchRuntime } from "@repo/search/runtime";

export async function ProductSearch() {
  const locale = await getLocale();
  const { endpoint, autocompleteRoutes } =
    searchRuntime.getClientConfiguration(locale);
  return <SearchAutocomplete endpoint={endpoint} routes={autocompleteRoutes} />;
}
