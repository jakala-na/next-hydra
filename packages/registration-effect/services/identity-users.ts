import { Context, Effect, Layer, Redacted, Ref, Schema } from "effect";
import type { RedactedEmail } from "../domain/identity";

export class IdentityUserLookupFailure extends Schema.TaggedErrorClass<IdentityUserLookupFailure>()(
  "IdentityUserLookupFailure",
  {
    message: Schema.String,
    operation: Schema.Literal("hasUserWithEmail"),
    cause: Schema.Defect,
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
  }
>()("@repo/registration-effect/IdentityUsers") {
  static readonly layerMemoryFrom = (emails: Iterable<RedactedEmail>) =>
    Layer.effect(
      IdentityUsers,
      Effect.gen(function* () {
        const knownEmails = yield* Ref.make(
          new Set([...emails].map(normalizedIdentityEmail))
        );

        return IdentityUsers.of({
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
