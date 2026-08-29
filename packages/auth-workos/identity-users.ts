import { hasTransientTransportCode } from "@repo/errors/transport";
import {
  AuthUserId,
  Email,
  PersonName,
} from "@repo/registration/domain/identity";
import type {
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
import type { AutoPaginatable, User } from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";

type WorkosIdentityUserListItem = Pick<
  User,
  "email" | "firstName" | "id" | "lastName"
>;

export interface WorkosIdentityUserManagement {
  readonly getUser: (authUserId: string) => Promise<unknown>;
  readonly listUsers: (input: {
    readonly email: string;
    readonly limit: number;
  }) => Promise<Pick<AutoPaginatable<WorkosIdentityUserListItem>, "data">>;
}

const WorkosIdentityUserProfile = Schema.Struct({
  email: Schema.String,
  firstName: Schema.optional(Schema.NullOr(Schema.String)),
  lastName: Schema.optional(Schema.NullOr(Schema.String)),
});

const WorkosIdentityUser = Schema.Struct({
  email: Schema.String,
  firstName: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.NonEmptyString,
  lastName: Schema.optional(Schema.NullOr(Schema.String)),
});

const WorkosIdentityUserListData = Schema.Array(WorkosIdentityUser);
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
  operation: "findByEmail" | "getById",
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

const redactedPersonName = (value: string | null | undefined) =>
  value === undefined || value === null || value === ""
    ? undefined
    : Redacted.make(PersonName.make(value), { label: "personName" });

export const makeWorkosIdentityUsers = (
  userManagement: WorkosIdentityUserManagement
) => {
  const findByEmail = Effect.fn("IdentityUsers.Workos.findByEmail")(
    (email: RedactedEmail) =>
      Effect.tryPromise({
        catch: (cause) => providerFailure("findByEmail", cause),
        try: async () =>
          await userManagement.listUsers({
            email: Redacted.value(email),
            limit: 1,
          }),
      }).pipe(
        Effect.flatMap((users) =>
          Schema.decodeEffect(WorkosIdentityUserListData)(users.data).pipe(
            Effect.orDie
          )
        ),
        Effect.map((users) => {
          const requestedEmail = Redacted.value(email).trim().toLowerCase();
          const user = users.find(
            (candidate) =>
              candidate.email.trim().toLowerCase() === requestedEmail
          );

          return user === undefined
            ? Option.none()
            : Option.some({
                authUserId: AuthUserId.make(user.id),
                email: Redacted.make(Email.make(user.email), {
                  label: "email",
                }),
                firstName: redactedPersonName(user.firstName),
                lastName: redactedPersonName(user.lastName),
                name: displayName(user),
              } satisfies IdentityUserProfile);
        })
      )
  );

  return IdentityUsers.of({
    findByEmail,
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
              firstName: redactedPersonName(user.firstName),
              lastName: redactedPersonName(user.lastName),
              name: displayName(user),
            })
          )
        )
    ),
    hasUserWithEmail: Effect.fn("IdentityUsers.Workos.hasUserWithEmail")(
      (email: RedactedEmail) =>
        findByEmail(email).pipe(Effect.map(Option.isSome))
    ),
  });
};

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
