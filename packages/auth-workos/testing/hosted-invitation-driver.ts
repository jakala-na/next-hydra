import type { AcceptPendingAuthInvitationInput } from "@repo/auth-contract/e2e/auth-test-control";
import { expect } from "@repo/e2e-testing";
import type { WorkOS } from "@workos-inc/node";

type Page = AcceptPendingAuthInvitationInput["page"];

export interface WorkosHostedInvitationInput {
  readonly applicationUrl: string;
  readonly email: string;
  readonly firstName: string;
  readonly invitationToken: string;
  readonly lastName: string;
  readonly page: Page;
  readonly password: string;
}

export type WorkosHostedInvitationDriver = (
  input: WorkosHostedInvitationInput
) => Promise<void>;

interface WorkosHostedInvitationDriverOptions {
  readonly clientId: string;
  readonly userManagement: Pick<
    WorkOS["userManagement"],
    "getAuthorizationUrl"
  >;
}

export const workosHostedInvitationDriver =
  ({
    clientId,
    userManagement,
  }: WorkosHostedInvitationDriverOptions): WorkosHostedInvitationDriver =>
  async ({
    applicationUrl,
    email,
    firstName,
    invitationToken,
    lastName,
    page,
    password,
  }) => {
    const callbackUrl = new URL("/api/auth/callback", applicationUrl);
    const invitationUrl = new URL(
      userManagement.getAuthorizationUrl({
        clientId,
        provider: "authkit",
        redirectUri: callbackUrl.href,
        screenHint: "sign-up",
      })
    );
    invitationUrl.searchParams.set("invitation_token", invitationToken);

    await page.goto(invitationUrl.href);
    await expect(
      page.getByRole("heading", { name: "Accept invitation" })
    ).toBeVisible();

    const invitationEmail = page.locator('input[name="email"]');
    await expect(invitationEmail).toHaveValue(email);
    await page
      .getByRole("button", {
        exact: true,
        name: "Continue with email",
      })
      .click();

    await page.locator('input[name="first_name"]').fill(firstName);
    await page.locator('input[name="last_name"]').fill(lastName);
    await page.getByRole("button", { exact: true, name: "Continue" }).click();

    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { exact: true, name: "Continue" }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.origin === callbackUrl.origin &&
        url.pathname !== callbackUrl.pathname,
      { timeout: 30_000 }
    );
  };
