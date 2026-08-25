import { Context, Schema } from "effect";
import type { Effect } from "effect";

import {
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
  RegistrationId,
} from "../domain/identity";

export const RegistrationInvitationEvent = Schema.Union([
  Schema.Struct({
    acceptedIdentity: Schema.Struct({
      authUserId: AuthUserId,
      email: Email,
      firstName: Schema.optional(PersonName),
      lastName: Schema.optional(PersonName),
    }),
    event: Schema.Literal("accepted"),
  }),
  Schema.Struct({
    event: Schema.Literal("revoked"),
  }),
]);
export type RegistrationInvitationEvent =
  typeof RegistrationInvitationEvent.Type;

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

export class RegistrationWorkflowInvitationResumeOutcomeUnknown extends Schema.TaggedErrorClass<RegistrationWorkflowInvitationResumeOutcomeUnknown>()(
  "RegistrationWorkflowInvitationResumeOutcomeUnknown",
  {
    cause: Schema.Defect,
    invitationId: InvitationId,
    message: Schema.String,
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
    readonly resumeReview: (
      registrationId: RegistrationId,
      decision: RegistrationReviewWorkflowDecision
    ) => Effect.Effect<void, RegistrationWorkflowResumeOutcomeUnknown>;
    readonly resumeInvitation: (
      invitationId: InvitationId,
      event: RegistrationInvitationEvent
    ) => Effect.Effect<
      void,
      RegistrationWorkflowInvitationResumeOutcomeUnknown
    >;
  }
>()("@repo/registration/RegistrationWorkflow") {}
