import { expect, Then, When } from "@repo/e2e-testing";

When(
  "I select {string} from the Company switcher",
  async ({ page }, companyLabel: string) => {
    await page
      .getByRole("group", { name: "Company switcher" })
      .getByRole("button")
      .click();
    await page.getByRole("menuitem").filter({ hasText: companyLabel }).click();
  }
);

Then(
  "the Company switcher shows {string}",
  async ({ page }, companyLabel: string) => {
    await expect(
      page
        .getByRole("group", { name: "Company switcher" })
        .getByText(companyLabel, { exact: true })
    ).toBeVisible();
  }
);
