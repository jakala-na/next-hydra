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
import { NotFoundException, WorkOS } from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";

export interface WorkosIdentityUserManagement {
  readonly getUser: (authUserId: string) => Promise<unknown>;
  readonly listUsers: (input: {
    readonly email: string;
    readonly limit: number;
  }) => Promise<{ readonly data: readonly unknown[] }>;
}

const WorkosIdentityUserProfile = Schema.Struct({
  email: Schema.String,
  firstName: Schema.optional(Schema.NullOr(Schema.String)),
  lastName: Schema.optional(Schema.NullOr(Schema.String)),
});

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
          try: () => userManagement.getUser(String(authUserId)),
        }).pipe(
          Effect.flatMap((user) =>
            Schema.decodeUnknownEffect(WorkosIdentityUserProfile)(user).pipe(
              Effect.mapError((cause) => providerFailure("getById", cause))
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
          try: () =>
            userManagement.listUsers({
              email: Redacted.value(email),
              limit: 1,
            }),
        }).pipe(Effect.map((users) => users.data.length !== 0))
    ),
  });

export const identityUsersLayer = Layer.effect(
  IdentityUsers,
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted("WORKOS_API_KEY");
    const clientId = yield* Config.option(Config.string("WORKOS_CLIENT_ID"));
    const clientIdValue = Option.getOrUndefined(clientId);
    const workos = new WorkOS({
      apiKey: Redacted.value(apiKey),
      ...(clientIdValue === undefined ? {} : { clientId: clientIdValue }),
    });

    return makeWorkosIdentityUsers(workos.userManagement);
  })
);
