import { Schema } from "effect";
import { RegistrationReviewerActor } from "./actors";

export class ApprovedDecision extends Schema.Class<ApprovedDecision>(
  "ApprovedDecision"
)({
  decision: Schema.Literal("approved"),
  actor: RegistrationReviewerActor,
  reason: Schema.optional(Schema.String),
  decidedAt: Schema.Date,
}) {}

export class RejectedDecision extends Schema.Class<RejectedDecision>(
  "RejectedDecision"
)({
  decision: Schema.Literal("rejected"),
  actor: RegistrationReviewerActor,
  reason: Schema.optional(Schema.String),
  decidedAt: Schema.Date,
}) {}
