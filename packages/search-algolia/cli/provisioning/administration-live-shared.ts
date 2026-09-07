import { Effect } from "effect";

import { AlgoliaProvisioningError } from "./model";

export const operationError = (operation: string, cause: unknown) =>
  new AlgoliaProvisioningError({
    cause,
    message: `Algolia ${operation} failed`,
    operation,
  });

export const tryClient = <Value>(
  operation: string,
  run: () => Promise<Value>
) =>
  Effect.tryPromise({
    catch: (cause) => operationError(operation, cause),
    try: run,
  });

export const namedResource = <Resource extends { readonly name: string }>(
  resources: readonly Resource[],
  name: string,
  operation: string,
  legacyNames: readonly string[] = []
): Effect.Effect<Resource | undefined, AlgoliaProvisioningError> => {
  const managedNames = new Set([name, ...legacyNames]);
  const matching = resources.filter((resource) =>
    managedNames.has(resource.name)
  );
  return matching.length > 1
    ? Effect.fail(
        operationError(
          operation,
          new Error(
            `Found ${matching.length} resources matching managed names ${[...managedNames].map((managedName) => `"${managedName}"`).join(", ")}`
          )
        )
      )
    : Effect.succeed(matching[0]);
};

export const listAll = async <
  Resource,
  Response extends {
    readonly pagination: {
      readonly nbPages: number;
    };
  },
>(
  listPage: (page: number) => Promise<Response>,
  select: (response: Response) => readonly Resource[],
  page = 1
): Promise<readonly Resource[]> => {
  const response = await listPage(page);
  const resources = select(response);
  if (page >= response.pagination.nbPages) {
    return resources;
  }
  return [...resources, ...(await listAll(listPage, select, page + 1))];
};
