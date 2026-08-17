import { Effect, Redacted } from "effect";

import { RegistrationReviewerActor } from "../domain/actors";
import type { RegistrationId } from "../domain/identity";
import type { Registration } from "../domain/registration";
import { RegistrationWorkflow } from "../services/registration-workflow";
import type {
  RegistrationReviewWorkflowReviewer,
  RegistrationWorkflowResumeOutcomeUnknown,
} from "../services/registration-workflow";
import { Registrations } from "../services/registrations";
import type { RegistrationTransitionError } from "../services/registrations";

export {
  RegistrationReviewWorkflowDecision,
  RegistrationReviewWorkflowReviewer,
} from "../services/registration-workflow";

export const registrationReviewerActorFromWorkflow = (
  reviewer: RegistrationReviewWorkflowReviewer
) =>
  new RegistrationReviewerActor({
    actorType: "registration_reviewer",
    authUserId: reviewer.authUserId,
    email: Redacted.make(reviewer.email, { label: "email" }),
    name: reviewer.name,
  });

export interface AcceptRegistrationReviewDecisionInput {
  readonly registrationId: RegistrationId;
  readonly decision: "approved" | "rejected";
  readonly reviewer: RegistrationReviewerActor;
  readonly reason?: string;
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
)(function* acceptRegistrationReviewDecision(
  input: AcceptRegistrationReviewDecisionInput
): Effect.fn.Return<
  Registration,
  RegistrationTransitionError | RegistrationWorkflowResumeOutcomeUnknown,
  Registrations | RegistrationWorkflow
> {
  const registrations = yield* Registrations;
  const workflow = yield* RegistrationWorkflow;
  const processing = yield* registrations.markApprovalProcessing({
    decision: input.decision,
    registrationId: input.registrationId,
  });

  yield* workflow.resume(input.registrationId, {
    decision: input.decision,
    reviewer: toWorkflowReviewer(input.reviewer),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });

  return processing;
});
