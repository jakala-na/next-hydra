import type {
  AuthUserId,
  RedactedEmail,
} from "@repo/registration/domain/identity";
import {
  IdentityUserLookupFailure,
  IdentityUsers,
} from "@repo/registration/services/identity-users";
import { Effect, Layer } from "effect";

const deferredIdentityUserLookup = (
  operation: "getById" | "hasUserWithEmail"
) =>
  new IdentityUserLookupFailure({
    cause: new Error("Clerk onboarding is deferred"),
    message: `Clerk identity user ${operation} is not available in the current auth slice`,
    operation,
    reason: "unexpectedResponse",
  });

export const identityUsersLayer = Layer.succeed(
  IdentityUsers,
  IdentityUsers.of({
    getById: Effect.fn("IdentityUsers.Clerk.deferred")(
      (_authUserId: AuthUserId) =>
        Effect.fail(deferredIdentityUserLookup("getById"))
    ),
    hasUserWithEmail: Effect.fn("IdentityUsers.Clerk.deferred")(
      (_email: RedactedEmail) =>
        Effect.fail(deferredIdentityUserLookup("hasUserWithEmail"))
    ),
  })
);
