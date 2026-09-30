import type {
  Authentication,
  Destination,
  Source,
  Task,
  Transformation,
} from "@algolia/ingestion";

import type { AlgoliaAdministrationClients } from "./administration-live-clients";
import { listAll } from "./administration-live-shared";

export interface AlgoliaIngestionResourceCatalog {
  readonly listAuthentications: () => Promise<readonly Authentication[]>;
  readonly listDestinations: () => Promise<readonly Destination[]>;
  readonly listSources: () => Promise<readonly Source[]>;
  readonly listTasks: () => Promise<readonly Task[]>;
  readonly listTransformations: () => Promise<readonly Transformation[]>;
}

export const algoliaIngestionResourceCatalog = (
  ingestion: AlgoliaAdministrationClients["ingestion"]
): AlgoliaIngestionResourceCatalog => {
  let authentications: Promise<readonly Authentication[]> | undefined;
  let destinations: Promise<readonly Destination[]> | undefined;
  let sources: Promise<readonly Source[]> | undefined;
  let tasks: Promise<readonly Task[]> | undefined;
  let transformations: Promise<readonly Transformation[]> | undefined;

  return {
    listAuthentications: async () =>
      await (authentications ??= listAll(
        async (page) =>
          await ingestion.listAuthentications({ itemsPerPage: 100, page }),
        ({ authentications: resources }) => resources
      )),
    listDestinations: async () =>
      await (destinations ??= listAll(
        async (page) =>
          await ingestion.listDestinations({ itemsPerPage: 100, page }),
        ({ destinations: resources }) => resources
      )),
    listSources: async () =>
      await (sources ??= listAll(
        async (page) =>
          await ingestion.listSources({ itemsPerPage: 100, page }),
        ({ sources: resources }) => resources
      )),
    listTasks: async () =>
      await (tasks ??= listAll(
        async (page) => await ingestion.listTasks({ itemsPerPage: 100, page }),
        ({ tasks: resources }) => resources
      )),
    listTransformations: async () =>
      await (transformations ??= listAll(
        async (page) =>
          await ingestion.listTransformations({ itemsPerPage: 100, page }),
        ({ transformations: resources }) => resources
      )),
  };
};
