import {
  AuthProvisioningConflict,
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
import { Svix } from "svix";

const CLERK_API_BASE_URL = "https://api.clerk.com/v1";
const CLERK_WEBHOOK_PATH = "/api/webhooks/clerk";
const CLERK_ENDPOINT_UID = "next-hydra-customer-auth-webhook";
const CLERK_ENDPOINT_DESCRIPTION = "Next Hydra customer authentication webhook";

export const CLERK_WEBHOOK_EVENTS = [
  "organization.created",
  "organization.updated",
  "organizationMembership.created",
  "organizationMembership.deleted",
  "user.created",
  "user.deleted",
  "user.updated",
] as const;

interface ClerkEndpoint {
  readonly disabled?: boolean;
  readonly filterTypes?: readonly string[] | null;
  readonly id: string;
  readonly uid?: string | null;
  readonly url: string;
}

interface ClerkEndpointPage {
  readonly data: readonly ClerkEndpoint[];
  readonly done: boolean;
  readonly iterator?: string | null;
}

interface ClerkSvixClient {
  readonly createEndpoint: (
    appId: string,
    input: {
      readonly description: string;
      readonly disabled: boolean;
      readonly filterTypes: string[];
      readonly metadata: Record<string, string>;
      readonly uid: string;
      readonly url: string;
    }
  ) => Promise<ClerkEndpoint>;
  readonly getEndpointSecret: (
    appId: string,
    endpointId: string
  ) => Promise<string>;
  readonly listEndpoints: (
    appId: string,
    iterator?: string | null
  ) => Promise<ClerkEndpointPage>;
}

interface ClerkProvisioningDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly makeSvixClient: (
    token: string,
    serverUrl: string
  ) => ClerkSvixClient;
  readonly secretKey: Redacted.Redacted;
}

const ClerkManagementUrlResponse = Schema.Struct({
  svix_url: Schema.NonEmptyString,
});

const ClerkErrorResponse = Schema.Struct({
  errors: Schema.optional(
    Schema.Array(
      Schema.Struct({
        code: Schema.optional(Schema.String),
      })
    )
  ),
});

const SvixPortalKey = Schema.Struct({
  appId: Schema.NonEmptyString,
  oneTimeToken: Schema.NonEmptyString,
  region: Schema.NonEmptyString,
});

const SvixPortalSession = Schema.Struct({
  token: Schema.NonEmptyString,
});

const providerFailure = (operation: string, cause: unknown, message: string) =>
  new AuthProvisioningProviderFailure({
    cause,
    message,
    operation,
    provider: "clerk",
  });

const protocolError = (operation: string, cause: unknown, message: string) =>
  new AuthProvisioningProtocolError({
    cause,
    message,
    operation,
    provider: "clerk",
  });

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
        `Clerk returned an invalid ${operation} response`
      )
    )
  );

const responseJson = (response: Response, operation: string) =>
  Effect.tryPromise({
    catch: (cause) =>
      protocolError(
        operation,
        cause,
        `Clerk returned invalid JSON for ${operation}`
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
        `Clerk returned invalid JSON for ${operation}`
      )
    )
  );

const clerkPost = (
  dependencies: ClerkProvisioningDependencies,
  path: string,
  operation: string
) =>
  Effect.tryPromise({
    catch: (cause) =>
      providerFailure(operation, cause, `Clerk ${operation} request failed`),
    try: async () =>
      await dependencies.fetch(`${CLERK_API_BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${Redacted.value(dependencies.secretKey)}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
  });

const clerkErrorCode = (response: Response, operation: string) =>
  responseJson(response, operation).pipe(
    Effect.flatMap((body) =>
      decodeResponse(ClerkErrorResponse, body, operation)
    ),
    Effect.map((body) => body.errors?.[0]?.code)
  );

const requireSuccessfulJson = (
  response: Response,
  operation: string
): EffectType.Effect<
  unknown,
  AuthProvisioningProviderFailure | AuthProvisioningProtocolError
> =>
  response.ok
    ? responseJson(response, operation)
    : clerkErrorCode(response, operation).pipe(
        Effect.flatMap((code) =>
          Effect.fail(
            providerFailure(
              operation,
              new Error(`HTTP ${response.status}${code ? ` (${code})` : ""}`),
              `Clerk ${operation} failed`
            )
          )
        )
      );

const decodeManagementUrl = (response: Response, operation: string) =>
  requireSuccessfulJson(response, operation).pipe(
    Effect.flatMap((body) =>
      decodeResponse(ClerkManagementUrlResponse, body, operation)
    ),
    Effect.map((body) => body.svix_url)
  );

const createSvixApplication = (dependencies: ClerkProvisioningDependencies) =>
  clerkPost(dependencies, "/webhooks/svix", "create Svix application").pipe(
    Effect.flatMap((response) => {
      if (response.ok) {
        return decodeManagementUrl(response, "create Svix application");
      }

      return clerkErrorCode(response, "create Svix application").pipe(
        Effect.flatMap((code) =>
          code === "svix_app_exists"
            ? clerkPost(
                dependencies,
                "/webhooks/svix_url",
                "create Svix portal URL after concurrent setup"
              ).pipe(
                Effect.flatMap((retryResponse) =>
                  decodeManagementUrl(
                    retryResponse,
                    "create Svix portal URL after concurrent setup"
                  )
                )
              )
            : Effect.fail(
                providerFailure(
                  "create Svix application",
                  new Error(
                    `HTTP ${response.status}${code ? ` (${code})` : ""}`
                  ),
                  "Clerk could not create its Svix application"
                )
              )
        )
      );
    })
  );

const getManagementUrl = (dependencies: ClerkProvisioningDependencies) =>
  clerkPost(dependencies, "/webhooks/svix_url", "create Svix portal URL").pipe(
    Effect.flatMap((response) => {
      if (response.ok) {
        return decodeManagementUrl(response, "create Svix portal URL");
      }

      return clerkErrorCode(response, "create Svix portal URL").pipe(
        Effect.flatMap((code) =>
          code === "svix_app_missing"
            ? createSvixApplication(dependencies)
            : Effect.fail(
                providerFailure(
                  "create Svix portal URL",
                  new Error(
                    `HTTP ${response.status}${code ? ` (${code})` : ""}`
                  ),
                  "Clerk could not create a Svix portal URL"
                )
              )
        )
      );
    })
  );

const decodePortalKey = (managementUrl: string) =>
  Effect.try({
    catch: (cause) =>
      protocolError(
        "decode Svix portal URL",
        cause,
        "Clerk returned an invalid Svix portal URL"
      ),
    try: () => {
      const url = new URL(managementUrl);
      const encoded = new URLSearchParams(url.hash.slice(1)).get("key");
      if (!encoded) {
        throw new Error("Svix portal URL contains no app key");
      }
      return Buffer.from(encoded, "base64url").toString("utf-8");
    },
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))
    ),
    Effect.mapError((cause) =>
      protocolError(
        "decode Svix portal URL",
        cause,
        "Clerk returned an invalid Svix portal URL"
      )
    ),
    Effect.flatMap((body) =>
      decodeResponse(SvixPortalKey, body, "decode Svix portal URL")
    )
  );

const exchangePortalToken = (
  dependencies: ClerkProvisioningDependencies,
  portalKey: typeof SvixPortalKey.Type
) => {
  const serverUrl = `https://api.${portalKey.region}.svix.com`;
  return Effect.tryPromise({
    catch: (cause) =>
      providerFailure(
        "exchange Svix portal token",
        cause,
        "Svix portal token exchange request failed"
      ),
    try: async () =>
      await dependencies.fetch(
        `https://app.svix.com/api/${portalKey.region}/api/v1/auth/one-time-token`,
        {
          body: JSON.stringify({ oneTimeToken: portalKey.oneTimeToken }),
          headers: {
            Authorization: "Bearer unused",
            "Content-Type": "application/json",
          },
          method: "POST",
        }
      ),
  }).pipe(
    Effect.flatMap(
      (
        response
      ): EffectType.Effect<
        unknown,
        AuthProvisioningProviderFailure | AuthProvisioningProtocolError
      > =>
        response.ok
          ? responseJson(response, "exchange Svix portal token")
          : Effect.fail(
              providerFailure(
                "exchange Svix portal token",
                new Error(`HTTP ${response.status}`),
                "Svix portal token exchange failed"
              )
            )
    ),
    Effect.flatMap((body) =>
      decodeResponse(SvixPortalSession, body, "exchange Svix portal token")
    ),
    Effect.map((session) => ({
      appId: portalKey.appId,
      client: dependencies.makeSvixClient(session.token, serverUrl),
    }))
  );
};

const svixCall = <A>(operation: string, call: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) =>
      providerFailure(operation, cause, `Svix could not ${operation}`),
    try: async () => await call(),
  });

const listEndpoints = (client: ClerkSvixClient, appId: string) =>
  Effect.gen(function* () {
    const endpoints: ClerkEndpoint[] = [];
    let iterator: string | null | undefined;
    do {
      const pageIterator = iterator;
      const page = yield* svixCall(
        "list Clerk webhook endpoints",
        async () => await client.listEndpoints(appId, pageIterator)
      );
      endpoints.push(...page.data);
      iterator = page.done ? undefined : page.iterator;
    } while (iterator);
    return endpoints;
  });

const endpointInput = (webhookUrl: string) => ({
  description: CLERK_ENDPOINT_DESCRIPTION,
  disabled: false,
  filterTypes: [...CLERK_WEBHOOK_EVENTS],
  metadata: { owner: "next-hydra", pool: "customer" },
  uid: CLERK_ENDPOINT_UID,
  url: webhookUrl,
});

export const makeClerkAuthWebhookProvisioner = (
  dependencies: ClerkProvisioningDependencies
): AuthWebhookProvisionerValue =>
  AuthWebhookProvisioner.of({
    provision: Effect.fn("ClerkAuthProvisioning.provision")(function* ({
      apiUrl,
    }) {
      const webhookUrl = yield* authWebhookUrl(apiUrl, CLERK_WEBHOOK_PATH);
      const managementUrl = yield* getManagementUrl(dependencies);
      const portalKey = yield* decodePortalKey(managementUrl);
      const { appId, client } = yield* exchangePortalToken(
        dependencies,
        portalKey
      );
      const endpoints = yield* listEndpoints(client, appId);
      const managedEndpoints = endpoints.filter(
        (endpoint) => endpoint.uid === CLERK_ENDPOINT_UID
      );
      const urlMatches = endpoints.filter(
        (endpoint) => endpoint.url === webhookUrl
      );

      if (managedEndpoints.length > 1 || urlMatches.length > 1) {
        return yield* new AuthProvisioningConflict({
          endpointUrl: webhookUrl,
          message:
            "Clerk already has multiple matching customer webhooks; this one-off command will not modify them",
          provider: "clerk",
        });
      }

      const [existing] = managedEndpoints;
      const [urlMatch] = urlMatches;

      if (existing === undefined && urlMatch !== undefined) {
        return yield* new AuthProvisioningConflict({
          endpointUrl: webhookUrl,
          message:
            "Clerk already has an unmanaged webhook at this URL; this one-off command will not replace or duplicate it",
          provider: "clerk",
        });
      }

      if (
        existing !== undefined &&
        (existing.url !== webhookUrl ||
          existing.disabled === true ||
          !sameEventSet(existing.filterTypes ?? [], CLERK_WEBHOOK_EVENTS))
      ) {
        return yield* new AuthProvisioningConflict({
          endpointUrl: webhookUrl,
          message:
            "The managed Clerk webhook already exists with different URL, status, or events; this one-off command will not modify it",
          provider: "clerk",
        });
      }

      let action: "created" | "unchanged";
      let endpoint: ClerkEndpoint;
      if (existing === undefined) {
        endpoint = yield* svixCall(
          "create Clerk webhook endpoint",
          async () =>
            await client.createEndpoint(appId, endpointInput(webhookUrl))
        );
        action = "created";
      } else {
        endpoint = existing;
        action = "unchanged";
      }

      const signingSecret = yield* svixCall(
        "read Clerk webhook signing secret",
        async () => await client.getEndpointSecret(appId, endpoint.id)
      );

      return new ProvisionedAuthWebhook({
        action,
        endpointId: endpoint.id,
        endpointUrl: webhookUrl,
        events: [...CLERK_WEBHOOK_EVENTS],
        provider: "clerk",
        signingSecret: Redacted.make(signingSecret, {
          label: "authWebhookSigningSecret",
        }),
        signingSecretEnvironmentVariable: "CLERK_WEBHOOK_SECRET",
      });
    }),
    runtimeEnvironment: authWebhookRuntimeEnvironment("CLERK_WEBHOOK_SECRET"),
  });

const liveSvixClient = (token: string, serverUrl: string): ClerkSvixClient => {
  const svix = new Svix(token, { serverUrl });
  return {
    createEndpoint: async (appId, input) =>
      await svix.endpoint.create(appId, input, {
        idempotencyKey: CLERK_ENDPOINT_UID,
      }),
    getEndpointSecret: async (appId, endpointId) => {
      const secret = await svix.endpoint.getSecret(appId, endpointId);
      return secret.key;
    },
    listEndpoints: async (appId, iterator) =>
      await svix.endpoint.list(appId, { iterator, limit: 100 }),
  };
};

export const createClerkAuthProvisioningLayer = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  Layer.effect(
    AuthWebhookProvisioner,
    Config.redacted("CLERK_SECRET_KEY").pipe(
      Effect.map((secretKey) =>
        makeClerkAuthWebhookProvisioner({
          fetch: globalThis.fetch,
          makeSvixClient: liveSvixClient,
          secretKey,
        })
      )
    )
  ).pipe(Layer.provide(ConfigProvider.layer(configProvider)));
