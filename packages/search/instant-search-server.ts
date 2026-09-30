import "server-only";
import type {
  IndexWidget,
  SearchClient,
  UiState,
  Widget,
} from "instantsearch.js";
import InstantSearch from "instantsearch.js/es/lib/InstantSearch";
import {
  getInitialResults,
  waitForResults,
} from "instantsearch.js/es/lib/server";
import type { InstantSearchServerState } from "react-instantsearch";

import type {
  SearchAudience,
  SearchIndexAlias,
  SearchProvider,
} from "./contract";
import { validateSearchBatch } from "./validation";

export interface InstantSearchServerStateOptions {
  readonly audience: SearchAudience;
  readonly indexName: SearchIndexAlias;
  readonly initialUiState: UiState;
  readonly provider: SearchProvider;
  readonly widgets: readonly (IndexWidget | Widget)[];
}

/**
 * Runs InstantSearch's headless server lifecycle and forwards its exact request
 * batch across the provider seam. Callers only describe the index tree and
 * initial UI state; the private hydration lifecycle stays local to this module.
 */
export async function getInstantSearchServerState({
  audience,
  indexName,
  initialUiState,
  provider,
  widgets,
}: InstantSearchServerStateOptions): Promise<InstantSearchServerState> {
  const searchClient: SearchClient = {
    search: async (requests) =>
      await provider.search(validateSearchBatch({ requests }), audience),
  };

  const search = new InstantSearch({
    future: { preserveSharedStateOnUnmount: true },
    indexName,
    initialUiState,
    searchClient,
  });
  search.addWidgets([...widgets]);

  // Match React InstantSearch's server lifecycle: start with an empty hydrated
  // result set so start() initializes helpers without issuing an extra query.
  search._initialResults = {};
  search._manuallyResetScheduleSearch = true;
  search.start();

  try {
    const requestParameters = await waitForResults(search);
    return {
      initialResults: getInitialResults(search.mainIndex, requestParameters),
    };
  } finally {
    search.dispose();
  }
}
