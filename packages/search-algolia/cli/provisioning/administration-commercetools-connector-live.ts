import type { Log } from "algoliasearch";
import { Effect } from "effect";

import type { AlgoliaAdministration } from "./administration";
import type { AlgoliaIngestionResourceCatalog } from "./administration-ingestion-catalog-live";
import type { AlgoliaAdministrationClients } from "./administration-live-clients";
import {
  namedResource,
  operationError,
  tryClient,
} from "./administration-live-shared";

type CommercetoolsConnectorAdministration = Pick<
  AlgoliaAdministration["Service"],
  "configureCommercetoolsConnector"
>;

const INITIAL_REINDEX_POLL_INTERVAL = "2 seconds";
const INITIAL_REINDEX_MAX_POLLS = 900;

const eventDetails = (
  events: readonly {
    readonly data?: unknown;
    readonly status: string | null;
    readonly type: string;
  }[]
) =>
  events
    .slice(0, 10)
    .map(({ data, status, type }) => {
      const encodedData =
        data === undefined || data === null ? "" : `: ${JSON.stringify(data)}`;
      return `${type}/${status ?? "unknown"}${encodedData}`;
    })
    .join("; ");

const applicationLogDetails = (
  logs: readonly Pick<Log, "answer" | "answer_code" | "method" | "url">[],
  runId: string
) =>
  logs
    .filter(({ url }) => url.includes(runId))
    .slice(0, 10)
    .map(({ answer, answer_code: answerCode, method, url }) => {
      const summary = answer.trim().replaceAll(/\s+/gu, " ").slice(0, 500);
      return `${method} ${url} -> ${answerCode}${summary === "" ? "" : `: ${summary}`}`;
    })
    .join("; ");

export const algoliaCommercetoolsConnectorAdministration = (
  clients: Pick<AlgoliaAdministrationClients, "ingestion" | "search">,
  catalog: AlgoliaIngestionResourceCatalog
): CommercetoolsConnectorAdministration => {
  const waitForSuccessfulRun = Effect.fn(
    "AlgoliaAdministration.waitForSuccessfulRun"
  )(function* (runId: string) {
    for (let poll = 0; poll < INITIAL_REINDEX_MAX_POLLS; poll += 1) {
      const run = yield* tryClient(
        "initial reindex status lookup",
        async () => await clients.ingestion.getRun({ runID: runId })
      );
      if (run.status === "finished" && run.outcome === "success") {
        return;
      }
      if (run.status === "finished" || run.status === "skipped") {
        const { events } = yield* tryClient(
          "initial reindex event lookup",
          async () =>
            await clients.ingestion.listEvents({
              itemsPerPage: 100,
              runID: runId,
              status: ["failed", "critical"],
            })
        );
        const details = eventDetails(events);
        const applicationDetails =
          details === ""
            ? yield* tryClient(
                "initial reindex application log lookup",
                async () =>
                  await clients.search.getLogs({ length: 100, type: "error" })
              ).pipe(
                Effect.map(({ logs }) => applicationLogDetails(logs, runId)),
                Effect.catch((error) =>
                  Effect.succeed(
                    `application log lookup failed: ${String(error.cause)}`
                  )
                )
              )
            : "";
        const reason = run.reason ?? run.reasonCode ?? "no reason was returned";
        return yield* operationError(
          "initial reindex run",
          new Error(
            `Run ${runId} ${run.status} with outcome ${run.outcome ?? "unknown"}: ${reason}${details === "" ? "" : `. Events: ${details}`}${applicationDetails === "" ? "" : `. Application logs: ${applicationDetails}`}`
          )
        );
      }
      yield* Effect.sleep(INITIAL_REINDEX_POLL_INTERVAL);
    }

    return yield* operationError(
      "initial reindex run",
      new Error(
        `Run ${runId} did not finish after ${INITIAL_REINDEX_MAX_POLLS} status checks`
      )
    );
  });

  return {
    configureCommercetoolsConnector: Effect.fn(
      "AlgoliaAdministration.configureCommercetoolsConnector"
    )(function* (options) {
      const transformationName = `${options.name} transformation`;
      const legacyTransformationNames = options.legacyNames?.map(
        (name) => `${name} transformation`
      );
      const existingTransformations = yield* tryClient(
        "transformation lookup",
        catalog.listTransformations
      );
      const existingTransformation = yield* namedResource(
        existingTransformations,
        transformationName,
        "transformation reconciliation",
        legacyTransformationNames
      );
      const transformationInput = {
        authenticationIDs: [...options.transformationAuthenticationIds],
        description:
          "Projects commerce Products into the canonical search document",
        input: { code: options.transformationCode },
        name: transformationName,
        type: "code" as const,
      };
      const transformationId = existingTransformation
        ? (yield* tryClient(
            "transformation update",
            async () =>
              await clients.ingestion.updateTransformation({
                transformationCreate: transformationInput,
                transformationID: existingTransformation.transformationID,
              })
          )).transformationID
        : (yield* tryClient(
            "transformation creation",
            async () =>
              await clients.ingestion.createTransformation(transformationInput)
          )).transformationID;
      const transformationPreview = yield* tryClient(
        "transformation validation",
        async () =>
          await clients.ingestion.tryTransformationBeforeUpdate({
            transformationID: transformationId,
            transformationTry: {
              input: transformationInput.input,
              sampleRecord: {
                objectID: "provisioning-validation-product",
                variants: [],
              },
              type: "code",
            },
          })
      );
      if (transformationPreview.error !== undefined) {
        return yield* operationError(
          "transformation validation",
          new Error(
            transformationPreview.error.message ??
              `Transformation preview failed with code ${String(transformationPreview.error.code ?? "unknown")}`
          )
        );
      }

      const sourceName = `${options.name} source`;
      const legacySourceNames = options.legacyNames?.map(
        (name) => `${name} source`
      );
      const existingSources = yield* tryClient(
        "source lookup",
        catalog.listSources
      );
      const existingSource = yield* namedResource(
        existingSources,
        sourceName,
        "source reconciliation",
        legacySourceNames
      );
      const sourceUpdateInput = {
        fallbackIsInStockValue: false,
        locales: [...options.locales],
        storeKeys: [options.storeKey],
        url: options.url,
      };
      const sourceId = existingSource
        ? (yield* tryClient(
            "source update",
            async () =>
              await clients.ingestion.updateSource({
                sourceID: existingSource.sourceID,
                sourceUpdate: {
                  authenticationID: options.commercetoolsAuthenticationId,
                  input: sourceUpdateInput,
                  name: sourceName,
                },
              })
          )).sourceID
        : (yield* tryClient(
            "source creation",
            async () =>
              await clients.ingestion.createSource({
                authenticationID: options.commercetoolsAuthenticationId,
                input: {
                  ...sourceUpdateInput,
                  projectKey: options.projectKey,
                },
                name: sourceName,
                type: "commercetools",
              })
          )).sourceID;

      const destinationName = `${options.name} destination`;
      const legacyDestinationNames = options.legacyNames?.map(
        (name) => `${name} destination`
      );
      const existingDestinations = yield* tryClient(
        "destination lookup",
        catalog.listDestinations
      );
      const existingDestination = yield* namedResource(
        existingDestinations,
        destinationName,
        "destination reconciliation",
        legacyDestinationNames
      );
      const destinationInput = {
        authenticationID: options.algoliaAuthenticationId,
        input: { indexName: options.indexName, recordType: "product" as const },
        name: destinationName,
        transformationIDs: [transformationId],
      };
      const destinationId = existingDestination
        ? (yield* tryClient(
            "destination update",
            async () =>
              await clients.ingestion.updateDestination({
                destinationID: existingDestination.destinationID,
                destinationUpdate: destinationInput,
              })
          )).destinationID
        : (yield* tryClient(
            "destination creation",
            async () =>
              await clients.ingestion.createDestination({
                ...destinationInput,
                type: "search",
              })
          )).destinationID;

      const existingTasks = yield* tryClient("task lookup", catalog.listTasks);
      const existingTask = existingTasks.find(
        (task) =>
          task.sourceID === sourceId && task.destinationID === destinationId
      );
      const taskInput = {
        action: "replace" as const,
        destinationID: destinationId,
        enabled: true,
        failureThreshold: 0,
        subscriptionAction: "replace" as const,
      };
      const taskId = existingTask
        ? (yield* tryClient(
            "task update",
            async () =>
              await clients.ingestion.replaceTask({
                taskID: existingTask.taskID,
                taskReplace: taskInput,
              })
          )).taskID
        : (yield* tryClient(
            "task creation",
            async () =>
              await clients.ingestion.createTask({
                ...taskInput,
                sourceID: sourceId,
              })
          )).taskID;
      const run = yield* tryClient(
        "initial reindex",
        async () => await clients.ingestion.runTask({ taskID: taskId })
      );
      yield* waitForSuccessfulRun(run.runID);

      return {
        destinationId,
        runId: run.runID,
        sourceId,
        taskId,
        transformationId,
      };
    }),
  };
};
