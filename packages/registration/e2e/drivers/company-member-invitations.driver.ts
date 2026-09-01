import { expect } from "@repo/e2e-testing";
import type { Locator, Page } from "@repo/e2e-testing";

import { COMPANY_ROLE_LABELS } from "../company-roles";
import type { CompanyRoleLabel } from "../company-roles";
import type { CompanyMemberInviteeReference } from "../registration-scenario";

export { COMPANY_ROLE_LABELS } from "../company-roles";
export type { CompanyRoleLabel } from "../company-roles";

export class CompanyMemberInvitationsDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async openCompanyUsers(): Promise<void> {
    await this.#page.goto("/en-US/account");
    await expect(
      this.#page.getByRole("heading", { exact: true, name: "Customer area" })
    ).toBeVisible();
    await expect(
      this.#page.getByText("Company users", { exact: true })
    ).toBeVisible();
  }

  async invite(
    invitee: CompanyMemberInviteeReference,
    roles: readonly CompanyRoleLabel[]
  ): Promise<void> {
    await this.#page.getByLabel("First name").fill(invitee.firstName);
    await this.#page.getByLabel("Last name").fill(invitee.lastName);
    await this.#page.getByLabel("Email address").fill(invitee.email);

    await this.#setRoleSelection("Admin", roles.includes("Admin"));
    await this.#setRoleSelection("Buyer", roles.includes("Buyer"));
    await this.#setRoleSelection("Approver", roles.includes("Approver"));

    await this.#page
      .getByRole("button", { exact: true, name: "Send invitation" })
      .click();
    await expect(
      this.#page.getByRole("alert").filter({ hasText: "Invitation sent" })
    ).toContainText(`An invitation was sent to ${invitee.email}.`);
  }

  async expectPendingInvitation(
    invitee: CompanyMemberInviteeReference
  ): Promise<void> {
    const row = this.#invitationRow(invitee.email);

    await expect(row).toBeVisible();
    await expect(row).toContainText(`${invitee.firstName} ${invitee.lastName}`);
    await expect(row.getByText("Pending", { exact: true })).toBeVisible();
  }

  async expectInvitationRoles(
    invitee: CompanyMemberInviteeReference,
    roles: readonly CompanyRoleLabel[]
  ): Promise<void> {
    const row = this.#invitationRow(invitee.email);

    await Promise.all(
      COMPANY_ROLE_LABELS.map(async (role) => {
        const roleBadge = row.getByText(role, { exact: true });
        await (roles.includes(role)
          ? expect(roleBadge).toBeVisible()
          : expect(roleBadge).toHaveCount(0));
      })
    );
  }

  async expectCompanyMember(
    invitee: CompanyMemberInviteeReference,
    companyName: string,
    roles: readonly CompanyRoleLabel[]
  ): Promise<void> {
    const memberRow = this.#memberRow(invitee.email);

    await expect(async () => {
      await this.#page.reload();
      await expect(memberRow).toBeVisible();
    }).toPass({ timeout: 30_000 });
    await expect(
      this.#page
        .getByRole("group", { name: "Company switcher" })
        .getByText(companyName, { exact: true })
    ).toBeVisible();
    await expect(memberRow).toContainText(
      `${invitee.firstName} ${invitee.lastName}`
    );
    await CompanyMemberInvitationsDriver.#expectRoles(memberRow, roles);
  }

  async #setRoleSelection(
    role: CompanyRoleLabel,
    shouldBeSelected: boolean
  ): Promise<void> {
    const checkbox = this.#page.getByRole("checkbox", {
      name: new RegExp(`^${role}`, "u"),
    });
    if ((await checkbox.isChecked()) !== shouldBeSelected) {
      await checkbox.click();
    }
  }

  #invitationRow(email: string) {
    return this.#page.getByRole("row").filter({
      has: this.#page.getByText(email, { exact: true }),
    });
  }

  #memberRow(email: string) {
    return this.#page
      .getByRole("row")
      .filter({ has: this.#page.getByText(email, { exact: true }) })
      .filter({ has: this.#page.getByText("Active", { exact: true }) });
  }

  static async #expectRoles(
    row: Locator,
    roles: readonly CompanyRoleLabel[]
  ): Promise<void> {
    await Promise.all(
      COMPANY_ROLE_LABELS.map(async (role) => {
        const roleBadge = row.getByText(role, { exact: true });
        await (roles.includes(role)
          ? expect(roleBadge).toBeVisible()
          : expect(roleBadge).toHaveCount(0));
      })
    );
  }
}
