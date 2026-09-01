import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { InvitationId, RegistrationId } from "../domain/identity";
import { RegistrationInvitationIssueAttempts } from "./registration-invitation-issue-attempts";

describe("RegistrationInvitationIssueAttempts.layerMemory", () => {
  it.effect("keeps the first provider baseline for approval retries", () =>
    Effect.gen(function* () {
      const attempts = yield* RegistrationInvitationIssueAttempts;
      const registrationId = RegistrationId.make("registration-1");
      const excluded = InvitationId.make("invitation-unrelated");

      const first = yield* attempts.start({
        excludedProviderInvitationIds: [excluded],
        registrationId,
      });
      const retry = yield* attempts.start({
        excludedProviderInvitationIds: [
          excluded,
          InvitationId.make("invitation-created-after-checkpoint"),
        ],
        registrationId,
      });

      expect({
        excludedProviderInvitationIds:
          retry.attempt.excludedProviderInvitationIds,
        firstStarted: first.started,
        retryStarted: retry.started,
      }).toStrictEqual({
        excludedProviderInvitationIds: [excluded],
        firstStarted: true,
        retryStarted: false,
      });

      const recorded = yield* attempts.recordIssued({
        providerInvitationId: InvitationId.make("invitation-issued"),
        registrationId,
      });
      const recordedAgain = yield* attempts.recordIssued({
        providerInvitationId: InvitationId.make("invitation-issued"),
        registrationId,
      });
      const conflicting = yield* attempts
        .recordIssued({
          providerInvitationId: InvitationId.make("invitation-other"),
          registrationId,
        })
        .pipe(Effect.flip);

      expect(recorded.providerInvitationId).toBe(
        InvitationId.make("invitation-issued")
      );
      expect(recordedAgain.providerInvitationId).toBe(
        recorded.providerInvitationId
      );
      expect(conflicting.reason).toBe("invalidData");
    }).pipe(Effect.provide(RegistrationInvitationIssueAttempts.layerMemory))
  );
});
