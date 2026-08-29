import type { CompanyMemberInvitee } from "./drivers/company-member-invitations.driver";
import type {
  RegistrationCompany,
  RegistrationCompanyMember,
} from "./registration-context";

export interface RegistrationReference {
  readonly email: string;
  readonly registrationId: string;
}

export interface RegistrationScenario {
  companyMemberInvitee?: CompanyMemberInvitee;
  readonly companies: Map<string, RegistrationCompany>;
  readonly companyMembers: Map<string, RegistrationCompanyMember>;
  readonly registrations: Map<string, RegistrationReference>;
}

export const createRegistrationScenario = (): RegistrationScenario => ({
  companies: new Map(),
  companyMembers: new Map(),
  registrations: new Map(),
});
