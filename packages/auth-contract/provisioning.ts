/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- Effect Schema classes define the auth provisioning boundary. */

import {
  RuntimeEnvironmentPublicationReceipt,
  RuntimeEnvironmentPublisher,
  runtimeEnvironmentManifestFromSchema,
} from "@repo/cli-core/runtime-environment";
import type {
  RuntimeEnvironmentDestination,
  RuntimeEnvironmentPublisherError,
  RuntimeEnvironmentVariable,
} from "@repo/cli-core/runtime-environment";
import { Context, Effect, Schema } from "effect";

export const AuthProviderName = Schema.Literals(["clerk", "workos"]);
export type AuthProviderName = typeof AuthProviderName.Type;

export const AuthWebhookAction = Schema.Literals(["created", "unchanged"]);
export type AuthWebhookAction = typeof AuthWebhookAction.Type;

export const AuthWebhookSecretEnvironmentVariable = Schema.Literals([
  "CLERK_WEBHOOK_SECRET",
  "WORKOS_WEBHOOK_SECRET",
]);
export type AuthWebhookSecretEnvironmentVariable =
  typeof AuthWebhookSecretEnvironmentVariable.Type;

export class ProvisionedAuthWebhook extends Schema.Class<ProvisionedAuthWebhook>(
  "ProvisionedAuthWebhook"
)({
  action: AuthWebhookAction,
  endpointId: Schema.NonEmptyString,
  endpointUrl: Schema.NonEmptyString,
  events: Schema.Array(Schema.NonEmptyString),
  provider: AuthProviderName,
  signingSecret: Schema.Redacted(Schema.NonEmptyString, {
    label: "authWebhookSigningSecret",
  }),
  signingSecretEnvironmentVariable: AuthWebhookSecretEnvironmentVariable,
}) {}

export class AuthProvisioningReceipt extends Schema.Class<AuthProvisioningReceipt>(
  "AuthProvisioningReceipt"
)({
  action: AuthWebhookAction,
  credentials: RuntimeEnvironmentPublicationReceipt,
  endpointId: Schema.NonEmptyString,
  endpointUrl: Schema.NonEmptyString,
  events: Schema.Array(Schema.NonEmptyString),
  provider: AuthProviderName,
}) {}

export class AuthProvisioningInputError extends Schema.TaggedError<AuthProvisioningInputError>()(
  "AuthProvisioningInputError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}

export class AuthProvisioningProviderFailure extends Schema.TaggedError<AuthProvisioningProviderFailure>()(
  "AuthProvisioningProviderFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.NonEmptyString,
    provider: AuthProviderName,
  }
) {}

export class AuthProvisioningProtocolError extends Schema.TaggedError<AuthProvisioningProtocolError>()(
  "AuthProvisioningProtocolError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.NonEmptyString,
    provider: AuthProviderName,
  }
) {}

export class AuthProvisioningOutcomeUnknown extends Schema.TaggedError<AuthProvisioningOutcomeUnknown>()(
  "AuthProvisioningOutcomeUnknown",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.NonEmptyString,
    provider: AuthProviderName,
  }
) {}

export class AuthProvisioningConflict extends Schema.TaggedError<AuthProvisioningConflict>()(
  "AuthProvisioningConflict",
  {
    endpointUrl: Schema.NonEmptyString,
    message: Schema.String,
    provider: AuthProviderName,
  }
) {}

export type AuthProvisioningError =
  | AuthProvisioningConflict
  | AuthProvisioningInputError
  | AuthProvisioningOutcomeUnknown
  | AuthProvisioningProtocolError
  | AuthProvisioningProviderFailure;

export interface ProvisionAuthWebhookOptions {
  readonly apiUrl: string;
}

export interface AuthWebhookProvisionerValue {
  readonly runtimeEnvironment: readonly RuntimeEnvironmentVariable[];
  readonly provision: (
    options: ProvisionAuthWebhookOptions
  ) => Effect.Effect<ProvisionedAuthWebhook, AuthProvisioningError>;
}

export class AuthWebhookProvisioner extends Context.Service<
  AuthWebhookProvisioner,
  AuthWebhookProvisionerValue
>()("@repo/auth-contract/AuthWebhookProvisioner") {}

export interface ProvisionAuthOptions extends ProvisionAuthWebhookOptions {
  readonly destination: RuntimeEnvironmentDestination;
}

export const provisionAuth = Effect.fn("AuthProvisioning.provision")(function* (
  options: ProvisionAuthOptions
) {
  const provisioner = yield* AuthWebhookProvisioner;
  const publisher = yield* RuntimeEnvironmentPublisher;
  const prepared = yield* publisher.prepare({
    destination: options.destination,
    manifest: provisioner.runtimeEnvironment,
  });
  const webhook = yield* provisioner.provision({ apiUrl: options.apiUrl });
  const credentials = yield* publisher.publish(prepared, {
    [webhook.signingSecretEnvironmentVariable]: webhook.signingSecret,
  });

  return new AuthProvisioningReceipt({
    action: webhook.action,
    credentials,
    endpointId: webhook.endpointId,
    endpointUrl: webhook.endpointUrl,
    events: [...webhook.events],
    provider: webhook.provider,
  });
});

export type ProvisionAuthFailure =
  | AuthProvisioningError
  | RuntimeEnvironmentPublisherError;

export const authWebhookRuntimeEnvironment = (
  key: AuthWebhookSecretEnvironmentVariable
) =>
  runtimeEnvironmentManifestFromSchema(
    {
      [key]: Schema.Redacted(Schema.NonEmptyString),
    },
    ["api"]
  );

export const authWebhookUrl = (
  apiUrl: string,
  pathname: string
): Effect.Effect<string, AuthProvisioningInputError> =>
  Effect.try({
    catch: (cause) =>
      new AuthProvisioningInputError({
        cause,
        message: "The public API URL is invalid",
      }),
    try: () => {
      const baseUrl = new URL(apiUrl);
      if (baseUrl.protocol !== "https:") {
        throw new Error("The public API URL must use HTTPS");
      }
      return new URL(pathname, baseUrl).toString();
    },
  });

export const sameEventSet = (
  left: readonly string[],
  right: readonly string[]
) =>
  left.length === right.length &&
  left.every(
    (event) =>
      left.filter((candidate) => candidate === event).length ===
      right.filter((candidate) => candidate === event).length
  );
