import { hasTransientTransportCode } from "@repo/errors/transport";
import { Email } from "@repo/registration/domain/identity";
import type {
  AuthUserId,
  IdentityUserProfile,
  RedactedEmail,
} from "@repo/registration/domain/identity";
import {
  IdentityUserLookupFailure,
  IdentityUserNotFound,
  IdentityUsers,
} from "@repo/registration/services/identity-users";
import type { IdentityProviderFailureReason } from "@repo/registration/services/identity-users";
import {
  GenericServerException,
  NotFoundException,
  RateLimitExceededException,
  WorkOS,
} from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";

export interface WorkosIdentityUserManagement {
  readonly getUser: (authUserId: string) => Promise<unknown>;
  readonly listUsers: (input: {
    readonly email: string;
    readonly limit: number;
  }) => Promise<unknown>;
}

const WorkosIdentityUserProfile = Schema.Struct({
  email: Schema.String,
  firstName: Schema.optional(Schema.NullOr(Schema.String)),
  lastName: Schema.optional(Schema.NullOr(Schema.String)),
});

const WorkosIdentityUserList = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
});
const EMPTY_USER_LIST_LENGTH = 0;
const REQUEST_TIMEOUT_STATUS_CODE = 408;
const SERVER_ERROR_STATUS_CODE = 500;

const providerFailureReason = (
  cause: unknown
): IdentityProviderFailureReason =>
  cause instanceof RateLimitExceededException ||
  hasTransientTransportCode(cause) ||
  (cause instanceof GenericServerException &&
    (cause.status === REQUEST_TIMEOUT_STATUS_CODE ||
      cause.status >= SERVER_ERROR_STATUS_CODE))
    ? "unavailable"
    : "unexpectedResponse";

const providerFailure = (
  operation: "getById" | "hasUserWithEmail",
  cause: unknown
) =>
  new IdentityUserLookupFailure({
    cause,
    message: `WorkOS identity user ${operation} failed: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    reason: providerFailureReason(cause),
  });

const getIdentityUserFailure = (authUserId: AuthUserId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new IdentityUserNotFound({
        authUserId,
        message: `Identity user ${authUserId} was not found`,
      })
    : providerFailure("getById", cause);

const displayName = (user: {
  readonly email: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
}) =>
  [user.firstName, user.lastName]
    .filter(
      (value): value is string => typeof value === "string" && value !== ""
    )
    .join(" ") || user.email;

export const makeWorkosIdentityUsers = (
  userManagement: WorkosIdentityUserManagement
) =>
  IdentityUsers.of({
    getById: Effect.fn("IdentityUsers.Workos.getById")(
      (authUserId: AuthUserId) =>
        Effect.tryPromise({
          catch: (cause) => getIdentityUserFailure(authUserId, cause),
          try: async () => await userManagement.getUser(String(authUserId)),
        }).pipe(
          Effect.flatMap((user) =>
            Schema.decodeUnknownEffect(WorkosIdentityUserProfile)(user).pipe(
              Effect.orDie
            )
          ),
          Effect.map(
            (user): IdentityUserProfile => ({
              authUserId,
              email: Redacted.make(Email.make(user.email), {
                label: "email",
              }),
              name: displayName(user),
            })
          )
        )
    ),
    hasUserWithEmail: Effect.fn("IdentityUsers.Workos.hasUserWithEmail")(
      (email: RedactedEmail) =>
        Effect.tryPromise({
          catch: (cause) => providerFailure("hasUserWithEmail", cause),
          try: async () =>
            await userManagement.listUsers({
              email: Redacted.value(email),
              limit: 1,
            }),
        }).pipe(
          Effect.flatMap((users) =>
            Schema.decodeUnknownEffect(WorkosIdentityUserList)(users).pipe(
              Effect.orDie
            )
          ),
          Effect.map((users) => users.data.length !== EMPTY_USER_LIST_LENGTH)
        )
    ),
  });

const configKey = (prefix: string | undefined, key: string) =>
  prefix === undefined || prefix === "" ? key : `${prefix}_${key}`;

export const identityUsersLayerFromConfig = ({
  configPrefix,
}: {
  readonly configPrefix?: string;
} = {}) =>
  Layer.effect(
    IdentityUsers,
    Effect.gen(function* identityUsersLayerEffect() {
      const apiKey = yield* Config.redacted(
        configKey(configPrefix, "WORKOS_API_KEY")
      );
      const clientId = yield* Config.option(
        Config.string(configKey(configPrefix, "WORKOS_CLIENT_ID"))
      );
      const clientIdValue = Option.getOrUndefined(clientId);
      const workos = new WorkOS(
        clientIdValue === undefined
          ? { apiKey: Redacted.value(apiKey) }
          : { apiKey: Redacted.value(apiKey), clientId: clientIdValue }
      );

      return makeWorkosIdentityUsers(workos.userManagement);
    })
  );

export const identityUsersLayer = identityUsersLayerFromConfig();
