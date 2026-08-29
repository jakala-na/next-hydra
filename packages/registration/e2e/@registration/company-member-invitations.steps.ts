import { Then, When } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";

import { parseCompanyMemberName } from "../company-member-name";
import {
  COMPANY_ROLE_LABELS,
  CompanyMemberInvitationsDriver,
} from "../drivers/company-member-invitations.driver";
import type {
  CompanyMemberInvitee,
  CompanyRoleLabel,
} from "../drivers/company-member-invitations.driver";
import type { RegistrationScenario } from "../registration-scenario";

const driver = (page: Page) => new CompanyMemberInvitationsDriver(page);

const roleLabel = (value: string): CompanyRoleLabel => {
  const role = COMPANY_ROLE_LABELS.find(
    (candidate) => candidate.toLowerCase() === value.toLowerCase()
  );
  if (role === undefined) {
    throw new Error(`Unknown Company Role: ${value}`);
  }
  return role;
};

const inviteeFrom = (scenario: RegistrationScenario): CompanyMemberInvitee => {
  if (scenario.companyMemberInvitee === undefined) {
    throw new Error("The scenario does not have a Company Member invitee");
  }
  return scenario.companyMemberInvitee;
};

When("I am on the Manage Users page", async ({ page }) => {
  await driver(page).openCompanyUsers();
});

When(
  "I invite {string} with the {string} and {string} roles",
  async (
    { page, registration, registrationScenario, registrationTestData },
    name: string,
    firstRole: string,
    secondRole: string
  ) => {
    const { firstName, lastName } = parseCompanyMemberName(name);
    registrationScenario.companyMemberInvitee = {
      email: registrationTestData.uniqueEmail(`${firstName}.${lastName}`),
      firstName,
      lastName,
    };
    const roles = [roleLabel(firstRole), roleLabel(secondRole)];
    const invitee = inviteeFrom(registrationScenario);

    registration.trackCompanyMemberInvitation(invitee.email);
    await driver(page).invite(invitee, roles);
  }
);

Then(
  "a pending Company Member Invitation is shown for {string}",
  async ({ page, registrationScenario }, name: string) => {
    const invitee = inviteeFrom(registrationScenario);
    const expectedName = `${invitee.firstName} ${invitee.lastName}`;
    if (expectedName !== name) {
      throw new Error(
        `Expected the pending invitation for ${name}, but the invitee is ${expectedName}`
      );
    }
    await driver(page).expectPendingInvitation(invitee);
  }
);

Then(
  "the invitation offers the {string} and {string} roles",
  async (
    { page, registrationScenario },
    firstRole: string,
    secondRole: string
  ) => {
    await driver(page).expectInvitationRoles(
      inviteeFrom(registrationScenario),
      [roleLabel(firstRole), roleLabel(secondRole)]
    );
  }
);
