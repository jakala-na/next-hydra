import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import { ClientBuilder } from "@commercetools/ts-client";
import type {
  AuthMiddlewareOptions,
  HttpMiddlewareOptions,
} from "@commercetools/ts-client";
import { Effect, Layer, Redacted } from "effect";

import { CommercetoolsProjectAdministration } from "./administration";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
import {
  ApiClientId,
  PreparedProject,
  ProductProjectionSearchTimeout,
  ProjectAdministrationError,
  RuntimeClientCreationOutcomeUnknown,
  RuntimeCredentials,
} from "./model";
import { bootstrapScopesFor } from "./scopes";

const SEARCH_POLL_ATTEMPTS = 60;
const SEARCH_POLL_INTERVAL = "2 seconds";

const administrationError = (
  operation: ProjectAdministrationError["operation"],
  message: string,
  cause: unknown
) => new ProjectAdministrationError({ cause, message, operation });

export const projectAdministrationLayer = Layer.effect(
  CommercetoolsProjectAdministration,
  Effect.gen(function* () {
    const config = yield* BootstrapCommercetoolsConfig;
    const authMiddlewareOptions: AuthMiddlewareOptions = {
      credentials: {
        clientId: config.clientId,
        clientSecret: Redacted.value(config.clientSecret),
      },
      host: `https://auth.${config.region}.commercetools.com`,
      httpClient: fetch,
      projectKey: config.projectKey,
      scopes: bootstrapScopesFor(config.projectKey),
    };
    const httpMiddlewareOptions: HttpMiddlewareOptions = {
      enableRetry: false,
      host: `https://api.${config.region}.commercetools.com`,
      httpClient: fetch,
    };
    const client = new ClientBuilder()
      .withProjectKey(config.projectKey)
      .withClientCredentialsFlow(authMiddlewareOptions)
      .withHttpMiddleware(httpMiddlewareOptions)
      .build();
    const apiRoot = createApiBuilderFromCtpClient(client).withProjectKey({
      projectKey: config.projectKey,
    });

    const getProject = Effect.fn("ProjectAdministration.getProject")(() =>
      Effect.tryPromise({
        catch: (cause) =>
          administrationError(
            "getProject",
            "Could not read the Commercetools Project",
            cause
          ),
        try: async () => {
          const response = await apiRoot.get().execute();
          return response.body;
        },
      })
    );

    const waitForProductProjectionSearch = (
      remainingAttempts: number
    ): Effect.Effect<
      PreparedProject,
      ProjectAdministrationError | ProductProjectionSearchTimeout
    > =>
      Effect.gen(function* () {
        const project = yield* getProject();
        const status = project.searchIndexing?.products?.status ?? "Unknown";

        if (status === "Activated") {
          return new PreparedProject({
            projectKey: config.projectKey,
            searchIndexingStatus: "Activated",
          });
        }
        if (remainingAttempts === 0) {
          return yield* new ProductProjectionSearchTimeout({
            lastStatus: status,
            message: "Product Projection Search did not activate in time",
          });
        }

        yield* Effect.sleep(SEARCH_POLL_INTERVAL);
        return yield* waitForProductProjectionSearch(remainingAttempts - 1);
      });

    const prepareProject = Effect.fn("ProjectAdministration.prepareProject")(
      function* () {
        const project = yield* getProject();
        const status = project.searchIndexing?.products?.status;

        if (status !== "Activated" && status !== "Indexing") {
          yield* Effect.tryPromise({
            catch: (cause) =>
              administrationError(
                "enableProductProjectionSearch",
                "Could not enable Product Projection Search",
                cause
              ),
            try: async () => {
              await apiRoot
                .post({
                  body: {
                    actions: [
                      {
                        action: "changeProductSearchIndexingEnabled",
                        enabled: true,
                        mode: "ProductProjectionsSearch",
                      },
                    ],
                    version: project.version,
                  },
                })
                .execute();
            },
          });
        }

        return yield* waitForProductProjectionSearch(SEARCH_POLL_ATTEMPTS);
      }
    );

    const createRuntimeClient = Effect.fn(
      "ProjectAdministration.createRuntimeClient"
    )((input: { readonly name: string; readonly scope: string }) =>
      Effect.tryPromise({
        catch: (cause) =>
          new RuntimeClientCreationOutcomeUnknown({
            cause,
            clientName: input.name,
            message:
              "The runtime API Client creation outcome could not be confirmed",
          }),
        try: async () => {
          const response = await apiRoot
            .apiClients()
            .post({
              body: {
                name: input.name,
                scope: input.scope,
              },
            })
            .execute();
          const { secret } = response.body;

          if (!secret) {
            throw new Error("API Client creation returned no secret");
          }

          return new RuntimeCredentials({
            clientId: ApiClientId.make(response.body.id),
            clientSecret: Redacted.make(secret, { label: "clientSecret" }),
            projectKey: config.projectKey,
            region: config.region,
            scope: response.body.scope,
          });
        },
      })
    );

    const deleteApiClient = Effect.fn("ProjectAdministration.deleteApiClient")(
      (clientId: ApiClientId) =>
        Effect.tryPromise({
          catch: (cause) =>
            administrationError(
              "deleteApiClient",
              `Could not delete API Client ${clientId}`,
              cause
            ),
          try: async () => {
            await apiRoot
              .apiClients()
              .withId({ ID: clientId })
              .delete()
              .execute();
          },
        })
    );

    return CommercetoolsProjectAdministration.of({
      createRuntimeClient,
      deleteApiClient,
      prepareProject: prepareProject(),
    });
  })
);
