import {
  CompanyMemberInvitationId,
  CommerceBusinessUnitId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import type { InvitationIntent } from "@repo/registration/domain/invitations";
import { CompanyRoles } from "@repo/registration/domain/roles";
import { Schema } from "effect";

const ClerkCompanyMemberMetadata = Schema.Struct({
  businessUnitId: CommerceBusinessUnitId,
  companyMemberInvitationId: CompanyMemberInvitationId,
  intent: Schema.Literal("company_member"),
  roles: CompanyRoles,
});

const ClerkRegistrationApprovalMetadata = Schema.Struct({
  intent: Schema.Literal("registration_approval"),
  registrationId: RegistrationId,
  roles: CompanyRoles,
});

export const ClerkInvitationMetadata = Schema.Struct({
  invitation: Schema.Union([
    ClerkRegistrationApprovalMetadata,
    ClerkCompanyMemberMetadata,
  ]),
});
export type ClerkInvitationMetadata = typeof ClerkInvitationMetadata.Type;

export const clerkInvitationMetadataFromIntent = (
  intent: InvitationIntent
): ClerkInvitationMetadata => {
  const invitation =
    intent.intent === "registration_approval"
      ? {
          intent: intent.intent,
          registrationId: intent.registrationId,
          roles: intent.roles,
        }
      : {
          businessUnitId: intent.businessUnitId,
          companyMemberInvitationId: intent.companyMemberInvitationId,
          intent: intent.intent,
          roles: intent.roles,
        };

  return { invitation };
};
