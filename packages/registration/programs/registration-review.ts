import { Effect, Redacted, Schema } from "effect";

import { RegistrationReviewerActor } from "../domain/actors";
import { AuthUserId, Email } from "../domain/identity";
import type { RegistrationId } from "../domain/identity";
import type { Registration } from "../domain/registration";
import { Registrations } from "../services/registrations";
import type { RegistrationTransitionError } from "../services/registrations";

export const RegistrationReviewWorkflowReviewer = Schema.Struct({
  authUserId: AuthUserId,
  email: Email,
  name: Schema.String,
});
export type RegistrationReviewWorkflowReviewer =
  typeof RegistrationReviewWorkflowReviewer.Type;

export const RegistrationReviewWorkflowDecision = Schema.Struct({
  decision: Schema.Literals(["approved", "rejected"]),
  reason: Schema.optional(Schema.String),
  reviewer: RegistrationReviewWorkflowReviewer,
});
export type RegistrationReviewWorkflowDecision =
  typeof RegistrationReviewWorkflowDecision.Type;

export const registrationReviewerActorFromWorkflow = (
  reviewer: RegistrationReviewWorkflowReviewer
) =>
  new RegistrationReviewerActor({
    actorType: "registration_reviewer",
    authUserId: reviewer.authUserId,
    email: Redacted.make(reviewer.email, { label: "email" }),
    name: reviewer.name,
  });

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
  authUserId: reviewer.authUserId,
  email: Redacted.value(reviewer.email),
  name: reviewer.name,
});

export const acceptRegistrationReviewDecision = Effect.fn(
  "acceptRegistrationReviewDecision"
)(function* acceptRegistrationReviewDecision<E>(
  input: AcceptRegistrationReviewDecisionInput<E>
): Effect.fn.Return<
  Registration,
  RegistrationTransitionError | E,
  Registrations
> {
  const registrations = yield* Registrations;
  const processing = yield* registrations.markApprovalProcessing({
    decision: input.decision,
    registrationId: input.registrationId,
  });

  yield* input.resumeWorkflow(input.registrationId, {
    decision: input.decision,
    reviewer: toWorkflowReviewer(input.reviewer),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });

  return processing;
});
