import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient, createClerkClient } from "@clerk/nextjs/server";
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
  normalizedIdentityEmail,
} from "@repo/registration/services/identity-users";
import type { IdentityProviderFailureReason } from "@repo/registration/services/identity-users";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";

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
  operation: "findByEmail" | "getById",
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

const redactedPersonName = (value: string | null) =>
  value === null || value === ""
    ? undefined
    : Redacted.make(PersonName.make(value), { label: "personName" });

const toIdentityUserProfile = (
  user: typeof ClerkIdentityUser.Type
): IdentityUserProfile | undefined => {
  const email = primaryEmail(user);

  return email === undefined
    ? undefined
    : {
        authUserId: AuthUserId.make(user.id),
        email: Redacted.make(Email.make(email), { label: "email" }),
        firstName: redactedPersonName(user.firstName),
        lastName: redactedPersonName(user.lastName),
        name: displayName(user, email),
      };
};

export const makeClerkIdentityUsers = (users: ClerkIdentityUsersApi) => {
  const findByEmail = Effect.fn("IdentityUsers.Clerk.findByEmail")((
    email: RedactedEmail
  ) => {
    const requestedEmail = normalizedIdentityEmail(email);

    return Effect.tryPromise({
      catch: (cause) => providerFailure("findByEmail", cause),
      try: async () =>
        await users.getUserList({
          emailAddress: [requestedEmail],
          limit: 1,
        }),
    }).pipe(
      Effect.flatMap((response) =>
        Schema.decodeEffect(ClerkIdentityUserList)(response).pipe(Effect.orDie)
      ),
      Effect.map((response) =>
        Option.fromUndefinedOr(
          response.data
            .filter((user) =>
              user.emailAddresses.some(
                (candidate) =>
                  candidate.emailAddress.trim().toLowerCase() === requestedEmail
              )
            )
            .map(toIdentityUserProfile)
            .find((profile) => profile !== undefined)
        )
      )
    );
  });

  return IdentityUsers.of({
    findByEmail,
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
                  firstName: redactedPersonName(user.firstName),
                  lastName: redactedPersonName(user.lastName),
                  name: displayName(user, email),
                } satisfies IdentityUserProfile);
          })
        )
    ),
    hasUserWithEmail: Effect.fn("IdentityUsers.Clerk.hasUserWithEmail")(
      (email: RedactedEmail) =>
        findByEmail(email).pipe(Effect.map(Option.isSome))
    ),
  });
};

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

const configKey = (prefix: string | undefined, key: string) =>
  prefix === undefined || prefix === "" ? key : `${prefix}_${key}`;

export const identityUsersLayerFromConfig = ({
  configPrefix,
}: {
  readonly configPrefix?: string;
} = {}) =>
  Layer.effect(
    IdentityUsers,
    Effect.gen(function* identityUsersLayerFromConfigEffect() {
      const secretKey = yield* Config.redacted(
        configKey(configPrefix, "CLERK_SECRET_KEY")
      );
      const client = createClerkClient({
        secretKey: Redacted.value(secretKey),
      });

      return makeClerkIdentityUsers({
        getUser: async (authUserId) => await client.users.getUser(authUserId),
        getUserList: async (input) =>
          await client.users.getUserList({
            emailAddress: [...input.emailAddress],
            limit: input.limit,
          }),
      });
    })
  );
