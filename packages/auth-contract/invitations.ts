/* oxlint-disable max-classes-per-file, typescript/no-unsafe-call, unicorn/throw-new-error -- Effect Schema tagged error factories form one provider-neutral invitation failure vocabulary; the lint analyzer does not understand their constructor types. */
import { Schema } from "effect";

/** Provider-neutral failures shared by invitation delivery capabilities and
 * their application-facing adapters. */
export class InvitationConflict extends Schema.TaggedError<InvitationConflict>()(
  "InvitationConflict",
  { message: Schema.String }
) {}

export class InvitationProviderFailure extends Schema.TaggedError<InvitationProviderFailure>()(
  "InvitationProviderFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["issue", "read", "accept", "revoke"]),
  }
) {}

export class InvitationIssueOutcomeUnknown extends Schema.TaggedError<InvitationIssueOutcomeUnknown>()(
  "InvitationIssueOutcomeUnknown",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}
