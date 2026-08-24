import { Schema } from "effect";

import { InvitationId, RegistrationId } from "../domain/identity";

export class RegistrationInvitationIssueAttempt extends Schema.Class<RegistrationInvitationIssueAttempt>(
  "RegistrationInvitationIssueAttempt"
)({
  excludedProviderInvitationIds: Schema.Array(InvitationId),
  providerInvitationId: Schema.optional(InvitationId),
  registrationId: RegistrationId,
}) {}
