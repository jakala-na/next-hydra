import { Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";

import { parseCompanyMemberName } from "../company-member-name";
import { companyRoleLabelsFrom } from "../company-roles";
import { CompanyMemberInvitationsDriver } from "../drivers/company-member-invitations.driver";
import type {
  CompanyMemberInvitationReference,
  RegistrationScenario,
} from "../registration-scenario";

const driver = (page: Page) => new CompanyMemberInvitationsDriver(page);

const invitationFrom = (
  scenario: RegistrationScenario,
  name: string
): CompanyMemberInvitationReference => {
  const invitation = scenario.companyMemberInvitations.get(name);
  if (invitation === undefined) {
    throw new Error(
      `The scenario does not have a Company Member Invitation for ${name}`
    );
  }
  return invitation;
};

const expectedRolesFrom = (
  invitation: CompanyMemberInvitationReference,
  dataTable: DataTable
) => {
  const expectedRoles = companyRoleLabelsFrom(dataTable);
  if (
    expectedRoles.length !== invitation.roles.length ||
    expectedRoles.some((role) => !invitation.roles.includes(role))
  ) {
    throw new Error(
      `Expected ${invitation.firstName} ${invitation.lastName} to have the Company Roles ${expectedRoles.join(", ")}, but the invitation offered ${invitation.roles.join(", ")}`
    );
  }
  return expectedRoles;
};

When("I am on the Manage Users page", async ({ page }) => {
  await driver(page).openCompanyUsers();
});

When(
  "I invite {string} with the Company Roles:",
  async (
    { auth, page, registration, registrationScenario, registrationTestData },
    name: string,
    dataTable: DataTable
  ) => {
    const { firstName, lastName } = parseCompanyMemberName(name);
    const existingIdentity = auth.identityFor(name);
    const invitation: CompanyMemberInvitationReference = {
      email:
        existingIdentity?.email ??
        registrationTestData.uniqueEmail(
          `${firstName}-${lastName}`.toLowerCase()
        ),
      firstName,
      lastName,
      roles: companyRoleLabelsFrom(dataTable),
    };

    registrationScenario.companyMemberInvitations.set(name, invitation);
    registration.trackCompanyMemberInvitation(invitation.email);
    await driver(page).invite(invitation, invitation.roles);
  }
);

Then(
  "a pending Company Member Invitation is shown for {string}",
  async ({ page, registrationScenario }, name: string) => {
    await driver(page).expectPendingInvitation(
      invitationFrom(registrationScenario, name)
    );
  }
);

Then(
  "the invitation for {string} offers the Company Roles:",
  async (
    { page, registrationScenario },
    name: string,
    dataTable: DataTable
  ) => {
    const invitation = invitationFrom(registrationScenario, name);
    await driver(page).expectInvitationRoles(
      invitation,
      expectedRolesFrom(invitation, dataTable)
    );
  }
);

When(
  "the invited person {string} accepts their invitation",
  async ({ auth, browser, registrationScenario }, name: string) => {
    const invitation = invitationFrom(registrationScenario, name);
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const invitedPersonPage = await context.newPage();
      await auth.acceptPendingInvitation(name, invitation, invitedPersonPage);
    } finally {
      await context.close();
    }
  }
);

Then(
  "the Company Member {string} belongs to {string} with the Company Roles:",
  async (
    { page, registrationScenario },
    name: string,
    companyName: string,
    dataTable: DataTable
  ) => {
    const invitation = invitationFrom(registrationScenario, name);
    await driver(page).expectCompanyMember(
      invitation,
      companyName,
      expectedRolesFrom(invitation, dataTable)
    );
  }
);
