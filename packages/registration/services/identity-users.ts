import { Context, Effect, Layer, Redacted, Ref, Schema } from "effect";

import { AuthUserId } from "../domain/identity";
import type { IdentityUserProfile, RedactedEmail } from "../domain/identity";

export const IdentityProviderFailureReason = Schema.Literals([
  "unavailable",
  "unexpectedResponse",
]);
export type IdentityProviderFailureReason =
  typeof IdentityProviderFailureReason.Type;

export class IdentityUserLookupFailure extends Schema.TaggedErrorClass<IdentityUserLookupFailure>()(
  "IdentityUserLookupFailure",
  {
    cause: Schema.Defect,
    message: Schema.String,
    operation: Schema.Literals(["getById", "hasUserWithEmail"]),
    reason: IdentityProviderFailureReason,
  }
) {}

export const isRecoverableIdentityUserLookupFailure = (
  error: IdentityUserLookupFailure
) => error.reason === "unavailable";

export class IdentityUserNotFound extends Schema.TaggedErrorClass<IdentityUserNotFound>()(
  "IdentityUserNotFound",
  {
    authUserId: AuthUserId,
    message: Schema.String,
  }
) {}

export const normalizedIdentityEmail = (email: RedactedEmail) =>
  Redacted.value(email).trim().toLowerCase();

export class IdentityUsers extends Context.Service<
  IdentityUsers,
  {
    readonly hasUserWithEmail: (
      email: RedactedEmail
    ) => Effect.Effect<boolean, IdentityUserLookupFailure>;
    readonly getById: (
      authUserId: AuthUserId
    ) => Effect.Effect<
      IdentityUserProfile,
      IdentityUserLookupFailure | IdentityUserNotFound
    >;
  }
>()("@repo/registration/IdentityUsers") {
  static readonly layerMemoryFrom = (
    emails: Iterable<RedactedEmail>,
    profiles: Iterable<IdentityUserProfile> = []
  ) =>
    Layer.effect(
      IdentityUsers,
      Effect.gen(function* () {
        const knownEmails = yield* Ref.make(
          new Set([...emails].map(normalizedIdentityEmail))
        );
        const profilesByAuthUserId = new Map(
          [...profiles].map((profile) => [String(profile.authUserId), profile])
        );

        return IdentityUsers.of({
          getById: Effect.fn("IdentityUsers.getById")(function* (authUserId) {
            const profile = profilesByAuthUserId.get(String(authUserId));

            if (profile === undefined) {
              return yield* new IdentityUserNotFound({
                authUserId,
                message: `Identity user ${authUserId} was not found`,
              });
            }

            return profile;
          }),
          hasUserWithEmail: Effect.fn("IdentityUsers.hasUserWithEmail")(
            (email) =>
              Ref.get(knownEmails).pipe(
                Effect.map((current) =>
                  current.has(normalizedIdentityEmail(email))
                )
              )
          ),
        });
      })
    );

  static readonly layerMemory = IdentityUsers.layerMemoryFrom([]);
}
