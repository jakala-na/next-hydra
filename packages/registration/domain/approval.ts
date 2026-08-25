import { Schema } from "effect";

import { RegistrationReviewerActor } from "./actors";

export class ApprovedDecision extends Schema.Class<ApprovedDecision>(
  "ApprovedDecision"
)({
  actor: RegistrationReviewerActor,
  decidedAt: Schema.Date,
  decision: Schema.Literal("approved"),
  reason: Schema.optional(Schema.String),
}) {}

export class RejectedDecision extends Schema.Class<RejectedDecision>(
  "RejectedDecision"
)({
  actor: RegistrationReviewerActor,
  decidedAt: Schema.Date,
  decision: Schema.Literal("rejected"),
  reason: Schema.optional(Schema.String),
}) {}
