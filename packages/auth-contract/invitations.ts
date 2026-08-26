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

/** Durable company-member invitation failures cross Registration and Commerce
 * composition without changing their runtime or schema identity. */
export class CompanyMemberInvitationNotFound extends Schema.TaggedError<CompanyMemberInvitationNotFound>()(
  "CompanyMemberInvitationNotFound",
  {
    companyMemberInvitationId: Schema.optional(Schema.NonEmptyString),
    message: Schema.String,
    providerInvitationId: Schema.optional(Schema.NonEmptyString),
  }
) {}

export class CompanyMemberInvitationPersistenceFailure extends Schema.TaggedError<CompanyMemberInvitationPersistenceFailure>()(
  "CompanyMemberInvitationPersistenceFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals([
      "read",
      "record",
      "accept",
      "expire",
      "provision",
      "reissue",
      "revoke",
    ]),
    reason: Schema.Literal("unavailable"),
  }
) {}

export class CompanyMemberInvitationRecordConflict extends Schema.TaggedError<CompanyMemberInvitationRecordConflict>()(
  "CompanyMemberInvitationRecordConflict",
  { message: Schema.String }
) {}

export class InvitationExpired extends Schema.TaggedError<InvitationExpired>()(
  "InvitationExpired",
  {
    expiredAt: Schema.Date,
    invitationId: Schema.NonEmptyString,
    message: Schema.String,
  }
) {}

export class InvitationNotFound extends Schema.TaggedError<InvitationNotFound>()(
  "InvitationNotFound",
  {
    invitationId: Schema.NonEmptyString,
    message: Schema.String,
  }
) {}
