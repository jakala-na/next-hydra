import type { CompanyRoleLabel } from "./company-roles";
import type {
  RegistrationCompany,
  RegistrationCompanyMember,
} from "./registration-context";

export interface RegistrationReference {
  readonly email: string;
  readonly registrationId: string;
}

export interface CompanyMemberInviteeReference {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface CompanyMemberInvitationReference extends CompanyMemberInviteeReference {
  readonly roles: readonly CompanyRoleLabel[];
}

export interface RegistrationScenario {
  readonly companies: Map<string, RegistrationCompany>;
  readonly companyMemberInvitations: Map<
    string,
    CompanyMemberInvitationReference
  >;
  readonly companyMembers: Map<string, RegistrationCompanyMember>;
  readonly registrations: Map<string, RegistrationReference>;
}

export const createRegistrationScenario = (): RegistrationScenario => ({
  companies: new Map(),
  companyMemberInvitations: new Map(),
  companyMembers: new Map(),
  registrations: new Map(),
});
