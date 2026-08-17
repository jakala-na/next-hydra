import { Context, type Effect, Schema } from "effect";

import { AuthUserId, Email, RegistrationId } from "../domain/identity";

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

export class RegistrationWorkflowStartUnavailable extends Schema.TaggedErrorClass<RegistrationWorkflowStartUnavailable>()(
  "RegistrationWorkflowStartUnavailable",
  {
    cause: Schema.Defect,
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationWorkflowResumeOutcomeUnknown extends Schema.TaggedErrorClass<RegistrationWorkflowResumeOutcomeUnknown>()(
  "RegistrationWorkflowResumeOutcomeUnknown",
  {
    cause: Schema.Defect,
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

/** Provider-neutral capability for handing Registration lifecycle work to the
 * durable workflow engine. Provider diagnostics stay inside these failures. */
export class RegistrationWorkflow extends Context.Service<
  RegistrationWorkflow,
  {
    readonly start: (
      registrationId: RegistrationId
    ) => Effect.Effect<void, RegistrationWorkflowStartUnavailable>;
    readonly resume: (
      registrationId: RegistrationId,
      decision: RegistrationReviewWorkflowDecision
    ) => Effect.Effect<void, RegistrationWorkflowResumeOutcomeUnknown>;
  }
>()("@repo/registration/RegistrationWorkflow") {}
