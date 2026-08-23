import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";
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
  normalizedIdentityEmail,
} from "@repo/registration/services/identity-users";
import type { IdentityProviderFailureReason } from "@repo/registration/services/identity-users";
import { Effect, Layer, Redacted, Schema } from "effect";

const ClerkEmailAddress = Schema.Struct({
  emailAddress: Schema.String,
  id: Schema.NonEmptyString,
});

const ClerkIdentityUser = Schema.Struct({
  emailAddresses: Schema.Array(ClerkEmailAddress),
  firstName: Schema.NullOr(Schema.String),
  id: Schema.NonEmptyString,
  lastName: Schema.NullOr(Schema.String),
  primaryEmailAddressId: Schema.NullOr(Schema.String),
});

const ClerkIdentityUserList = Schema.Struct({
  data: Schema.Array(ClerkIdentityUser),
});

export interface ClerkIdentityUsersApi {
  readonly getUser: (
    authUserId: string
  ) => Promise<typeof ClerkIdentityUser.Type>;
  readonly getUserList: (input: {
    readonly emailAddress: readonly string[];
    readonly limit: number;
  }) => Promise<typeof ClerkIdentityUserList.Type>;
}

const REQUEST_TIMEOUT_STATUS_CODE = 408;
const RATE_LIMIT_STATUS_CODE = 429;
const SERVER_ERROR_STATUS_CODE = 500;

const providerFailureReason = (
  cause: unknown
): IdentityProviderFailureReason =>
  hasTransientTransportCode(cause) ||
  (isClerkAPIResponseError(cause) &&
    (cause.status === REQUEST_TIMEOUT_STATUS_CODE ||
      cause.status === RATE_LIMIT_STATUS_CODE ||
      cause.status >= SERVER_ERROR_STATUS_CODE))
    ? "unavailable"
    : "unexpectedResponse";

const providerFailure = (
  operation: "getById" | "hasUserWithEmail",
  cause: unknown
) =>
  new IdentityUserLookupFailure({
    cause,
    message: `Clerk identity user ${operation} failed: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    reason: providerFailureReason(cause),
  });

const getIdentityUserFailure = (authUserId: AuthUserId, cause: unknown) =>
  isClerkAPIResponseError(cause) && cause.status === 404
    ? new IdentityUserNotFound({
        authUserId,
        message: `Identity user ${authUserId} was not found`,
      })
    : providerFailure("getById", cause);

const primaryEmail = (user: typeof ClerkIdentityUser.Type) =>
  user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId
  )?.emailAddress ?? user.emailAddresses.at(0)?.emailAddress;

const displayName = (user: typeof ClerkIdentityUser.Type, email: string) =>
  [user.firstName, user.lastName]
    .flatMap((value) => (value === null || value === "" ? [] : [value]))
    .join(" ") || email;

export const makeClerkIdentityUsers = (users: ClerkIdentityUsersApi) =>
  IdentityUsers.of({
    getById: Effect.fn("IdentityUsers.Clerk.getById")(
      (authUserId: AuthUserId) =>
        Effect.tryPromise({
          catch: (cause) => getIdentityUserFailure(authUserId, cause),
          try: async () => await users.getUser(String(authUserId)),
        }).pipe(
          Effect.flatMap((user) =>
            Schema.decodeEffect(ClerkIdentityUser)(user).pipe(Effect.orDie)
          ),
          Effect.flatMap((user) => {
            const email = primaryEmail(user);

            return email === undefined
              ? Effect.fail(
                  providerFailure(
                    "getById",
                    new Error(`Clerk user ${authUserId} has no email address`)
                  )
                )
              : Effect.succeed({
                  authUserId,
                  email: Redacted.make(Email.make(email), {
                    label: "email",
                  }),
                  name: displayName(user, email),
                } satisfies IdentityUserProfile);
          })
        )
    ),
    hasUserWithEmail: Effect.fn("IdentityUsers.Clerk.hasUserWithEmail")(
      (email: RedactedEmail) => {
        const requestedEmail = normalizedIdentityEmail(email);

        return Effect.tryPromise({
          catch: (cause) => providerFailure("hasUserWithEmail", cause),
          try: async () =>
            await users.getUserList({
              emailAddress: [requestedEmail],
              limit: 1,
            }),
        }).pipe(
          Effect.flatMap((response) =>
            Schema.decodeEffect(ClerkIdentityUserList)(response).pipe(
              Effect.orDie
            )
          ),
          Effect.map((response) =>
            response.data.some((user) =>
              user.emailAddresses.some(
                (candidate) =>
                  candidate.emailAddress.trim().toLowerCase() === requestedEmail
              )
            )
          )
        );
      }
    ),
  });

const clerkIdentityUsersApi: ClerkIdentityUsersApi = {
  getUser: async (authUserId) => {
    const client = await clerkClient();
    return await client.users.getUser(authUserId);
  },
  getUserList: async (input) => {
    const client = await clerkClient();
    return await client.users.getUserList({
      emailAddress: [...input.emailAddress],
      limit: input.limit,
    });
  },
};

export const identityUsersLayer = Layer.succeed(
  IdentityUsers,
  makeClerkIdentityUsers(clerkIdentityUsersApi)
);
