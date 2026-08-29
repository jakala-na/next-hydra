import { expect } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";

export const COMPANY_ROLE_LABELS = ["Admin", "Buyer", "Approver"] as const;

export type CompanyRoleLabel = (typeof COMPANY_ROLE_LABELS)[number];

export interface CompanyMemberInvitee {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

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
    invitee: CompanyMemberInvitee,
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

  async expectPendingInvitation(invitee: CompanyMemberInvitee): Promise<void> {
    const row = this.#invitationRow(invitee.email);

    await expect(row).toBeVisible();
    await expect(row).toContainText(`${invitee.firstName} ${invitee.lastName}`);
    await expect(row.getByText("Pending", { exact: true })).toBeVisible();
  }

  async expectInvitationRoles(
    invitee: CompanyMemberInvitee,
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
}
