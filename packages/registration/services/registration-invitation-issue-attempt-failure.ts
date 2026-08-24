import { StoreFailureReason } from "@repo/versioned-store";
import { Schema } from "effect";

import { RegistrationId } from "../domain/identity";

// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not a thrown error value.
export class RegistrationInvitationIssueAttemptFailure extends Schema.TaggedError<RegistrationInvitationIssueAttemptFailure>()(
  "RegistrationInvitationIssueAttemptFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    reason: StoreFailureReason,
    registrationId: RegistrationId,
  }
) {}
