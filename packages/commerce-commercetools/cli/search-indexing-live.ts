import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import { ClientBuilder } from "@commercetools/ts-client";
import type {
  AuthMiddlewareOptions,
  HttpMiddlewareOptions,
} from "@commercetools/ts-client";
import { CommerceSearchIndexingFailure } from "@repo/commerce/search-indexing";
import type { Effect as EffectType } from "effect";
import { ConfigProvider, Effect, Layer, Redacted, Schema } from "effect";

import { BootstrapCommercetoolsConfig } from "./project-provisioning/bootstrap-config";

const failure = (
  operation: CommerceSearchIndexingFailure["operation"],
  message: string,
  cause?: unknown
) =>
  cause === undefined
    ? new CommerceSearchIndexingFailure({ message, operation })
    : new CommerceSearchIndexingFailure({ cause, message, operation });

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

const escapePredicateValue = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const sameScopes = (left: string, right: string): boolean => {
  const leftScopes = new Set(left.trim().split(/\s+/u).filter(Boolean));
  const rightScopes = new Set(right.trim().split(/\s+/u).filter(Boolean));
  return (
    leftScopes.size === rightScopes.size &&
    [...leftScopes].every((scope) => rightScopes.has(scope))
  );
};

export const createCommercetoolsSearchIndexingSource = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>,
  dependencies: { readonly httpClient?: typeof fetch } = {}
) =>
  Effect.gen(function* () {
    const config = yield* BootstrapCommercetoolsConfig;
    const httpClient = dependencies.httpClient ?? fetch;
    const client = new ClientBuilder()
      .withProjectKey(config.projectKey)
      .withClientCredentialsFlow({
        credentials: {
          clientId: config.clientId,
          clientSecret: Redacted.value(config.clientSecret),
        },
        host: config.authUrl,
        httpClient,
        projectKey: config.projectKey,
        scopes: [...config.scopes],
      } satisfies AuthMiddlewareOptions)
      .withHttpMiddleware({
        enableRetry: false,
        host: config.apiUrl,
        httpClient,
      } satisfies HttpMiddlewareOptions)
      .build();
    const apiRoot = createApiBuilderFromCtpClient(client).withProjectKey({
      projectKey: config.projectKey,
    });

    const requireApiClientManagement = () => {
      const scope = `manage_api_clients:${config.projectKey}`;
      return config.scopes.includes(scope)
        ? Effect.void
        : Effect.fail(
            failure(
              "reconcileManagedApiClient",
              `The commercetools management API Client is missing ${scope}`
            )
          );
    };

    return {
      deleteManagedApiClient: Effect.fn(
        "CommercetoolsSearchIndexing.deleteManagedApiClient"
      )((clientId: string) =>
        requireApiClientManagement().pipe(
          Effect.andThen(
            Effect.tryPromise({
              catch: (cause) =>
                failure(
                  "deleteManagedApiClient",
                  `Could not delete replaced commerce API Client ${clientId}`,
                  cause
                ),
              try: async () => {
                try {
                  await apiRoot
                    .apiClients()
                    .withId({ ID: clientId })
                    .delete()
                    .execute();
                } catch (error) {
                  if (!isNotFound(error)) {
                    throw error;
                  }
                }
              },
            })
          )
        )
      ),
      reconcileManagedApiClient: Effect.fn(
        "CommercetoolsSearchIndexing.reconcileManagedApiClient"
      )(function* (input: {
        readonly existingClientId?: string;
        readonly existingScope?: string;
        readonly name: string;
        readonly scopeNames: readonly string[];
      }) {
        yield* requireApiClientManagement();
        const scope = input.scopeNames
          .map((name) => `${name}:${config.projectKey}`)
          .join(" ");
        const { existingClientId } = input;
        return yield* Effect.tryPromise({
          catch: (cause) =>
            failure(
              "reconcileManagedApiClient",
              `Could not reconcile managed commerce API Client "${input.name}"; its outcome may need verification`,
              cause
            ),
          try: async () => {
            const managedClientsResponse = await apiRoot
              .apiClients()
              .get({
                queryArgs: {
                  limit: 500,
                  where: `name = "${escapePredicateValue(input.name)}"`,
                  withTotal: false,
                },
              })
              .execute();
            const managedClients = managedClientsResponse.body.results;
            const current = managedClients.find(
              ({ id }) => id === existingClientId
            );
            if (
              input.existingScope !== undefined &&
              sameScopes(input.existingScope, scope) &&
              current?.name === input.name &&
              sameScopes(current.scope, scope)
            ) {
              return {
                clientId: current.id,
                scope,
                status: "current" as const,
              };
            }

            const response = await apiRoot
              .apiClients()
              .post({ body: { name: input.name, scope } })
              .execute();
            if (!response.body.secret) {
              throw new Error("API Client creation returned no secret");
            }
            const created = {
              clientId: response.body.id,
              clientSecret: Redacted.make(response.body.secret, {
                label: "clientSecret",
              }),
              scope: response.body.scope,
              status: "created" as const,
            };
            return input.existingClientId === undefined
              ? created
              : { ...created, replacedClientId: input.existingClientId };
          },
        });
      }),
      resolveContext: Effect.fn("CommercetoolsSearchIndexing.resolveContext")(
        (input: {
          readonly priceCustomerGroupIds: readonly string[];
          readonly storeKeys: readonly string[];
        }) =>
          Effect.tryPromise({
            catch: (cause) =>
              failure(
                "resolveIndexingContext",
                "Could not resolve commercetools search indexing context",
                cause
              ),
            try: async () => {
              const uniqueStoreKeys = [...new Set(input.storeKeys)];
              const stores = await Promise.all(
                uniqueStoreKeys.map(async (storeKey) => {
                  await apiRoot
                    .stores()
                    .withKey({ key: storeKey })
                    .get()
                    .execute();
                  return { storeKey };
                })
              );
              const priceCustomerGroupIds = await Promise.all(
                input.priceCustomerGroupIds.map(async (customerGroupId) => {
                  try {
                    const response = await apiRoot
                      .customerGroups()
                      .withId({ ID: customerGroupId })
                      .get()
                      .execute();
                    return response.body.id;
                  } catch (error) {
                    throw new Error(
                      `Configured pricing Customer Group "${customerGroupId}" could not be read from commercetools`,
                      { cause: error }
                    );
                  }
                })
              );

              return {
                apiUrl: config.apiUrl,
                authUrl: config.authUrl,
                priceCustomerGroupIds,
                projectKey: config.projectKey,
                stores,
              };
            },
          })
      ),
    };
  }).pipe(
    Effect.provide(
      BootstrapCommercetoolsConfig.layer.pipe(
        Layer.provide(ConfigProvider.layer(configProvider))
      )
    )
  );
