import { VersionedKeyValueStore } from "@repo/versioned-store";
import { Context, Effect, Layer, Option, Schema } from "effect";

import type { InvitationId, RegistrationId } from "../domain/identity";
import { RegistrationInvitationIssueAttempt } from "./registration-invitation-issue-attempt";
import { RegistrationInvitationIssueAttemptFailure } from "./registration-invitation-issue-attempt-failure";

export { RegistrationInvitationIssueAttempt } from "./registration-invitation-issue-attempt";
export { RegistrationInvitationIssueAttemptFailure } from "./registration-invitation-issue-attempt-failure";

export interface StartRegistrationInvitationIssueAttemptInput {
  readonly excludedProviderInvitationIds: readonly InvitationId[];
  readonly registrationId: RegistrationId;
}

export interface StartRegistrationInvitationIssueAttemptResult {
  readonly attempt: RegistrationInvitationIssueAttempt;
  readonly started: boolean;
}

export interface RecordRegistrationInvitationIssuedInput {
  readonly providerInvitationId: InvitationId;
  readonly registrationId: RegistrationId;
}

export interface RegistrationInvitationIssueAttemptsService {
  readonly recordIssued: (
    input: RecordRegistrationInvitationIssuedInput
  ) => Effect.Effect<
    RegistrationInvitationIssueAttempt,
    RegistrationInvitationIssueAttemptFailure
  >;
  readonly start: (
    input: StartRegistrationInvitationIssueAttemptInput
  ) => Effect.Effect<
    StartRegistrationInvitationIssueAttemptResult,
    RegistrationInvitationIssueAttemptFailure
  >;
}

const attemptKey = (registrationId: RegistrationId) =>
  `registration-invitation-issue:${registrationId}`;

export class RegistrationInvitationIssueAttempts extends Context.Service<
  RegistrationInvitationIssueAttempts,
  RegistrationInvitationIssueAttemptsService
>()("@repo/registration/RegistrationInvitationIssueAttempts") {
  static readonly layerStorage = Layer.effect(
    RegistrationInvitationIssueAttempts,
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      const readVersioned = Effect.fn(
        "RegistrationInvitationIssueAttempts.readVersioned"
      )((registrationId: RegistrationId) =>
        store
          .get(attemptKey(registrationId), RegistrationInvitationIssueAttempt)
          .pipe(
            Effect.mapError(
              // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect.mapError transforms the typed Effect error channel.
              (error) =>
                new RegistrationInvitationIssueAttemptFailure({
                  cause: error.cause,
                  message: `Failed to read invitation issue attempt for registration ${registrationId}: ${error.message}`,
                  reason: error.reason,
                  registrationId,
                })
            )
          )
      );

      const read = Effect.fn("RegistrationInvitationIssueAttempts.read")(
        (registrationId: RegistrationId) =>
          readVersioned(registrationId).pipe(
            Effect.map(Option.map((versioned) => versioned.value))
          )
      );

      const start = Effect.fn("RegistrationInvitationIssueAttempts.start")(
        function* (input: StartRegistrationInvitationIssueAttemptInput) {
          const existing = yield* read(input.registrationId);
          if (Option.isSome(existing)) {
            return { attempt: existing.value, started: false };
          }

          const attempt = new RegistrationInvitationIssueAttempt({
            excludedProviderInvitationIds: input.excludedProviderInvitationIds,
            registrationId: input.registrationId,
          });

          return yield* store
            .insert(
              attemptKey(input.registrationId),
              RegistrationInvitationIssueAttempt,
              attempt
            )
            .pipe(
              Effect.as({ attempt, started: true }),
              Effect.catchTag("StoreConflict", () =>
                read(input.registrationId).pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () =>
                        Effect.fail(
                          new RegistrationInvitationIssueAttemptFailure({
                            cause: new Error(
                              "Invitation issue attempt disappeared after an insert conflict"
                            ),
                            message: `Invitation issue attempt ${input.registrationId} conflicted but could not be read`,
                            reason: "unexpectedResponse",
                            registrationId: input.registrationId,
                          })
                        ),
                      onSome: (concurrent) =>
                        Effect.succeed({
                          attempt: concurrent,
                          started: false,
                        }),
                    })
                  )
                )
              ),
              Effect.mapError((error) =>
                Schema.is(RegistrationInvitationIssueAttemptFailure)(error)
                  ? error
                  : new RegistrationInvitationIssueAttemptFailure({
                      cause: error.cause,
                      message: `Failed to persist invitation issue attempt for registration ${input.registrationId}: ${error.message}`,
                      reason: error.reason,
                      registrationId: input.registrationId,
                    })
              )
            );
        }
      );

      const recordIssued = Effect.fn(
        "RegistrationInvitationIssueAttempts.recordIssued"
      )(function* (input: RecordRegistrationInvitationIssuedInput) {
        const current = yield* readVersioned(input.registrationId);
        if (Option.isNone(current)) {
          return yield* new RegistrationInvitationIssueAttemptFailure({
            cause: new Error("Invitation issue attempt was not started"),
            message: `Cannot record provider invitation for registration ${input.registrationId} before starting the issue attempt`,
            reason: "invalidData",
            registrationId: input.registrationId,
          });
        }

        if (
          current.value.value.providerInvitationId ===
          input.providerInvitationId
        ) {
          return current.value.value;
        }

        if (current.value.value.providerInvitationId !== undefined) {
          return yield* new RegistrationInvitationIssueAttemptFailure({
            cause: new Error("Provider invitation correlation is immutable"),
            message: `Registration ${input.registrationId} is already correlated to a different provider invitation`,
            reason: "invalidData",
            registrationId: input.registrationId,
          });
        }

        const attempt = new RegistrationInvitationIssueAttempt({
          excludedProviderInvitationIds:
            current.value.value.excludedProviderInvitationIds,
          providerInvitationId: input.providerInvitationId,
          registrationId: input.registrationId,
        });

        return yield* store
          .update(
            attemptKey(input.registrationId),
            RegistrationInvitationIssueAttempt,
            current.value,
            attempt
          )
          .pipe(
            Effect.as(attempt),
            Effect.catchTags({
              StoreConflict: () =>
                read(input.registrationId).pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () =>
                        Effect.fail(
                          new RegistrationInvitationIssueAttemptFailure({
                            cause: new Error(
                              "Invitation issue attempt disappeared after an update conflict"
                            ),
                            message: `Provider invitation correlation for registration ${input.registrationId} conflicted and could not be read`,
                            reason: "unexpectedResponse",
                            registrationId: input.registrationId,
                          })
                        ),
                      onSome: (concurrent) =>
                        concurrent.providerInvitationId ===
                        input.providerInvitationId
                          ? Effect.succeed(concurrent)
                          : Effect.fail(
                              new RegistrationInvitationIssueAttemptFailure({
                                cause: new Error(
                                  "Concurrent provider invitation correlation differs"
                                ),
                                message: `Registration ${input.registrationId} was concurrently correlated to a different provider invitation`,
                                reason: "invalidData",
                                registrationId: input.registrationId,
                              })
                            ),
                    })
                  )
                ),
              StoreError: (error) =>
                Effect.fail(
                  new RegistrationInvitationIssueAttemptFailure({
                    cause: error.cause,
                    message: `Failed to record provider invitation for registration ${input.registrationId}: ${error.message}`,
                    reason: error.reason,
                    registrationId: input.registrationId,
                  })
                ),
            })
          );
      });

      return RegistrationInvitationIssueAttempts.of({ recordIssued, start });
    })
  );

  static readonly layerMemory =
    RegistrationInvitationIssueAttempts.layerStorage.pipe(
      Layer.provide(VersionedKeyValueStore.layerMemory)
    );
}
