import { Effect } from "effect";

import type { AlgoliaAdministration } from "./administration";
import type { SearchAdministrationClient } from "./administration-live-clients";
import { tryClient } from "./administration-live-shared";

type IndexAdministration = Pick<
  AlgoliaAdministration["Service"],
  "configureIndex"
>;

export const algoliaIndexAdministration = (
  search: SearchAdministrationClient
): IndexAdministration => ({
  configureIndex: Effect.fn("AlgoliaAdministration.configureIndex")(function* ({
    indexName,
    settings,
  }) {
    const response = yield* tryClient(
      "index settings update",
      async () =>
        await search.setSettings({ indexName, indexSettings: settings })
    );
    if (response.taskID !== undefined) {
      yield* tryClient(
        "index settings task",
        async () =>
          await search.waitForTask({ indexName, taskID: response.taskID })
      );
    }
  }),
});
