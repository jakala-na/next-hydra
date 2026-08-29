import type { AuthContext } from "@repo/auth-contract/e2e/auth-context";
import { Given } from "@repo/e2e-testing";

import type { CompanyRole, CompanyRoles } from "../domain/roles";
import { parseCompanyMemberName } from "./company-member-name";
import type {
  GivenCompanyMemberInput,
  RegistrationCompany,
  RegistrationContext,
} from "./registration-context";
import type { RegistrationScenario } from "./registration-scenario";

type CompanyRoleLabel = "Admin" | "Approver" | "Buyer";

const COMPANY_ROLES_BY_LABEL = {
  Admin: "admin",
  Approver: "approver",
  Buyer: "buyer",
} as const satisfies Record<CompanyRoleLabel, CompanyRole>;

const companyRole = (value: string): CompanyRole => {
  const role = Object.entries(COMPANY_ROLES_BY_LABEL).find(
    ([label]) => label.toLowerCase() === value.toLowerCase()
  )?.[1];
  if (role === undefined) {
    throw new Error(`Unknown Company Role: ${value}`);
  }
  return role;
};

const ensureCompany = async (
  registration: RegistrationContext,
  scenario: RegistrationScenario,
  companyName: string
): Promise<RegistrationCompany> => {
  const existingCompany = scenario.companies.get(companyName);
  if (existingCompany !== undefined) {
    return existingCompany;
  }

  const company = await registration.givenCompany({
    administrator: {
      firstName: "Initial",
      lastName: `${companyName} Administrator`,
    },
    name: companyName,
  });
  scenario.companies.set(companyName, company);
  return company;
};

interface CompanyFixtures {
  readonly auth: AuthContext;
  readonly registration: RegistrationContext;
  readonly registrationScenario: RegistrationScenario;
}

const givenCompanyMember = async (
  { auth, registration, registrationScenario }: CompanyFixtures,
  name: string,
  companyName: string,
  role: string
) => {
  const company = await ensureCompany(
    registration,
    registrationScenario,
    companyName
  );
  const { firstName, lastName } = parseCompanyMemberName(name);
  const existingCompanyMember = registrationScenario.companyMembers.get(name);
  const roles: CompanyRoles = [companyRole(role)];
  const memberInput: GivenCompanyMemberInput =
    existingCompanyMember === undefined
      ? { company, firstName, lastName, roles }
      : {
          company,
          companyMember: existingCompanyMember,
          firstName,
          lastName,
          roles,
        };
  const companyMember = await registration.givenCompanyMember(memberInput);
  registrationScenario.companyMembers.set(name, companyMember);
  auth.rememberIdentity(name, companyMember);
};

Given(
  "{string} is a Company Member of {string} with the {string} role",
  givenCompanyMember
);
