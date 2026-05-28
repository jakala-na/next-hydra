import { Effect, Redacted } from "effect";
import type { RegistrationReviewerActor } from "../domain/actors";
import type { RegistrationId } from "../domain/identity";
import type { Registration } from "../domain/registration";
import {
  Registrations,
  type RegistrationTransitionError,
} from "../services/registrations";

export interface RegistrationReviewWorkflowReviewer {
  readonly authUserId: string;
  readonly email: string;
  readonly name: string;
}

export interface RegistrationReviewWorkflowDecision {
  readonly decision: "approved" | "rejected";
  readonly reviewer: RegistrationReviewWorkflowReviewer;
  readonly reason?: string;
}

export interface AcceptRegistrationReviewDecisionInput<E = never> {
  readonly registrationId: RegistrationId;
  readonly decision: "approved" | "rejected";
  readonly reviewer: RegistrationReviewerActor;
  readonly reason?: string;
  readonly resumeWorkflow: (
    registrationId: RegistrationId,
    decision: RegistrationReviewWorkflowDecision
  ) => Effect.Effect<void, E>;
}

const toWorkflowReviewer = (
  reviewer: RegistrationReviewerActor
): RegistrationReviewWorkflowReviewer => ({
  authUserId: String(reviewer.authUserId),
  email: String(Redacted.value(reviewer.email)),
  name: reviewer.name,
});

export const acceptRegistrationReviewDecision = Effect.fn(
  "acceptRegistrationReviewDecision"
)(function* <E>(
  input: AcceptRegistrationReviewDecisionInput<E>
): Effect.fn.Return<
  Registration,
  RegistrationTransitionError | E,
  Registrations
> {
  const registrations = yield* Registrations;
  const processing = yield* registrations.markApprovalProcessing({
    registrationId: input.registrationId,
    decision: input.decision,
  });

  yield* input.resumeWorkflow(input.registrationId, {
    decision: input.decision,
    reviewer: toWorkflowReviewer(input.reviewer),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });

  return processing;
});
