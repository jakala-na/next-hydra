import {
  CommerceBusinessUnitId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import type { InvitationIntent } from "@repo/registration/domain/invitations";
import { Schema } from "effect";

const ClerkCompanyMemberMetadata = Schema.Struct({
  businessUnitId: CommerceBusinessUnitId,
  intent: Schema.Literal("company_member"),
  role: Schema.Literal("associate"),
});

const ClerkRegistrationApprovalMetadata = Schema.Struct({
  intent: Schema.Literal("registration_approval"),
  registrationId: RegistrationId,
  role: Schema.Literal("owner"),
});

export const ClerkInvitationMetadata = Schema.Struct({
  nextHydra: Schema.Struct({
    invitation: Schema.Union([
      ClerkRegistrationApprovalMetadata,
      ClerkCompanyMemberMetadata,
    ]),
    version: Schema.Literal(1),
  }),
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
          role: intent.role,
        }
      : {
          businessUnitId: intent.businessUnitId,
          intent: intent.intent,
          role: intent.role,
        };

  return {
    nextHydra: {
      invitation,
      version: 1,
    },
  };
};
