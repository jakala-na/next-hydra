import {
  AuthProvisioningConflict,
  AuthProvisioningOutcomeUnknown,
  AuthProvisioningProtocolError,
  AuthProvisioningProviderFailure,
  AuthWebhookProvisioner,
  ProvisionedAuthWebhook,
  authWebhookRuntimeEnvironment,
  authWebhookUrl,
  sameEventSet,
} from "@repo/auth-contract/provisioning";
import type { AuthWebhookProvisionerValue } from "@repo/auth-contract/provisioning";
import type { Effect as EffectType } from "effect";
import {
  Config,
  ConfigProvider,
  Effect,
  Layer,
  Redacted,
  Schema,
} from "effect";

const WORKOS_API_BASE_URL = "https://api.workos.com";
const WORKOS_WEBHOOK_PATH = "/api/webhooks/workos";

export const WORKOS_WEBHOOK_EVENTS = [
  "invitation.accepted",
  "invitation.revoked",
] as const;

const WorkosWebhookEndpoint = Schema.Struct({
  endpoint_url: Schema.NonEmptyString,
  events: Schema.Array(Schema.NonEmptyString),
  id: Schema.NonEmptyString,
  secret: Schema.NonEmptyString,
  status: Schema.NonEmptyString,
});
type WorkosWebhookEndpoint = typeof WorkosWebhookEndpoint.Type;

const WorkosWebhookEndpointList = Schema.Struct({
  data: Schema.Array(WorkosWebhookEndpoint),
  list_metadata: Schema.Struct({
    after: Schema.NullOr(Schema.String),
  }),
});

interface WorkosProvisioningDependencies {
  readonly apiKey: Redacted.Redacted;
  readonly fetch: typeof globalThis.fetch;
}

const providerFailure = (operation: string, cause: unknown, message: string) =>
  new AuthProvisioningProviderFailure({
    cause,
    message,
    operation,
    provider: "workos",
  });

const protocolError = (operation: string, cause: unknown, message: string) =>
  new AuthProvisioningProtocolError({
    cause,
    message,
    operation,
    provider: "workos",
  });

const outcomeUnknown = (operation: string, cause: unknown, message: string) =>
  new AuthProvisioningOutcomeUnknown({
    cause,
    message,
    operation,
    provider: "workos",
  });

const responseJson = (response: Response, operation: string) =>
  Effect.tryPromise({
    catch: (cause) =>
      protocolError(
        operation,
        cause,
        `WorkOS returned invalid JSON for ${operation}`
      ),
    try: async () => await response.text(),
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))
    ),
    Effect.mapError((cause) =>
      protocolError(
        operation,
        cause,
        `WorkOS returned invalid JSON for ${operation}`
      )
    )
  );

const decodeResponse = <S extends Schema.Top>(
  schema: S,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This helper is the schema-decoding I/O boundary.
  body: unknown,
  operation: string
) =>
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError((cause) =>
      protocolError(
        operation,
        cause,
        `WorkOS returned an invalid ${operation} response`
      )
    )
  );

const workosFetch = (
  dependencies: WorkosProvisioningDependencies,
  path: string,
  operation: string,
  init?: RequestInit
) =>
  Effect.tryPromise({
    catch: (cause) =>
      providerFailure(operation, cause, `WorkOS ${operation} request failed`),
    try: async () => {
      const headers = new Headers(init?.headers);
      headers.set(
        "Authorization",
        `Bearer ${Redacted.value(dependencies.apiKey)}`
      );
      headers.set("Content-Type", "application/json");
      return await dependencies.fetch(`${WORKOS_API_BASE_URL}${path}`, {
        ...init,
        headers,
      });
    },
  });

const requireSuccessfulJson = (response: Response, operation: string) =>
  response.ok
    ? responseJson(response, operation)
    : Effect.fail(
        providerFailure(
          operation,
          new Error(`HTTP ${response.status}`),
          `WorkOS ${operation} failed`
        )
      );

const workosRequest = (
  dependencies: WorkosProvisioningDependencies,
  path: string,
  operation: string,
  init?: RequestInit
) =>
  workosFetch(dependencies, path, operation, init).pipe(
    Effect.flatMap(
      (
        response
      ): EffectType.Effect<
        unknown,
        AuthProvisioningProviderFailure | AuthProvisioningProtocolError
      > => requireSuccessfulJson(response, operation)
    )
  );

const listWebhookEndpoints = (dependencies: WorkosProvisioningDependencies) =>
  Effect.gen(function* () {
    const endpoints: WorkosWebhookEndpoint[] = [];
    let after: string | null = null;
    do {
      const query = new URLSearchParams({ limit: "100" });
      if (after !== null) {
        query.set("after", after);
      }
      const body = yield* workosRequest(
        dependencies,
        `/webhook_endpoints?${query.toString()}`,
        "list webhook endpoints"
      );
      const page = yield* decodeResponse(
        WorkosWebhookEndpointList,
        body,
        "list webhook endpoints"
      );
      endpoints.push(...page.data);
      ({ after } = page.list_metadata);
    } while (after !== null);
    return endpoints;
  });

const createWebhookEndpoint = (
  dependencies: WorkosProvisioningDependencies,
  endpointUrl: string
) => {
  const operation = "create webhook endpoint";
  return workosFetch(dependencies, "/webhook_endpoints", operation, {
    body: JSON.stringify({
      endpoint_url: endpointUrl,
      events: WORKOS_WEBHOOK_EVENTS,
    }),
    method: "POST",
  }).pipe(
    Effect.mapError((cause) =>
      outcomeUnknown(
        operation,
        cause,
        "WorkOS may have created the webhook; inspect the provider before retrying"
      )
    ),
    Effect.flatMap(
      (
        response
      ): EffectType.Effect<
        unknown,
        AuthProvisioningOutcomeUnknown | AuthProvisioningProviderFailure
      > =>
        response.ok
          ? responseJson(response, operation).pipe(
              Effect.mapError((cause) =>
                outcomeUnknown(
                  operation,
                  cause,
                  "WorkOS created the webhook but returned an unreadable response; inspect the provider before retrying"
                )
              )
            )
          : Effect.fail(
              providerFailure(
                operation,
                new Error(`HTTP ${response.status}`),
                `WorkOS ${operation} failed`
              )
            )
    ),
    Effect.flatMap((body) =>
      decodeResponse(WorkosWebhookEndpoint, body, operation).pipe(
        Effect.mapError((cause) =>
          outcomeUnknown(
            operation,
            cause,
            "WorkOS created the webhook but returned an invalid response; inspect the provider before retrying"
          )
        )
      )
    )
  );
};

export const makeWorkosAuthWebhookProvisioner = (
  dependencies: WorkosProvisioningDependencies
): AuthWebhookProvisionerValue =>
  AuthWebhookProvisioner.of({
    provision: Effect.fn("WorkosAuthProvisioning.provision")(function* ({
      apiUrl,
    }) {
      const endpointUrl = yield* authWebhookUrl(apiUrl, WORKOS_WEBHOOK_PATH);
      const endpoints = yield* listWebhookEndpoints(dependencies);
      const matches = endpoints.filter(
        (endpoint) => endpoint.endpoint_url === endpointUrl
      );

      if (matches.length > 1) {
        return yield* new AuthProvisioningConflict({
          endpointUrl,
          message:
            "WorkOS has multiple webhook endpoints for this URL; remove duplicates before provisioning",
          provider: "workos",
        });
      }

      const [existing] = matches;
      let action: "created" | "unchanged";
      let endpoint: WorkosWebhookEndpoint;
      if (existing === undefined) {
        endpoint = yield* createWebhookEndpoint(dependencies, endpointUrl);
        action = "created";
      } else if (
        existing.status !== "enabled" ||
        !sameEventSet(existing.events, WORKOS_WEBHOOK_EVENTS)
      ) {
        return yield* new AuthProvisioningConflict({
          endpointUrl,
          message:
            "The WorkOS webhook already exists with different status or events; this one-off command will not modify it",
          provider: "workos",
        });
      } else {
        endpoint = existing;
        action = "unchanged";
      }

      return new ProvisionedAuthWebhook({
        action,
        endpointId: endpoint.id,
        endpointUrl,
        events: [...WORKOS_WEBHOOK_EVENTS],
        provider: "workos",
        signingSecret: Redacted.make(endpoint.secret, {
          label: "authWebhookSigningSecret",
        }),
        signingSecretEnvironmentVariable: "WORKOS_WEBHOOK_SECRET",
      });
    }),
    runtimeEnvironment: authWebhookRuntimeEnvironment("WORKOS_WEBHOOK_SECRET"),
  });

export const createWorkosAuthProvisioningLayer = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  Layer.effect(
    AuthWebhookProvisioner,
    Config.redacted("WORKOS_API_KEY").pipe(
      Effect.map((apiKey) =>
        makeWorkosAuthWebhookProvisioner({
          apiKey,
          fetch: globalThis.fetch,
        })
      )
    )
  ).pipe(Layer.provide(ConfigProvider.layer(configProvider)));
