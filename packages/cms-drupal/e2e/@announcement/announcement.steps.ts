import { expect, test } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd(test);
type Observation = {
  count: number;
  message: string | null;
  href: string | null;
  aboveHeader: boolean;
};
const observations = new WeakMap<Page, Observation[]>();

async function observe(page: Page, path: string): Promise<Observation> {
  await page.goto(path);
  const banner = page.getByRole("note", { name: "Announcement" });
  await expect(banner).toBeVisible();
  const bannerBox = await banner.boundingBox();
  const headerBox = await page.getByRole("banner").boundingBox();
  return {
    aboveHeader: Boolean(
      bannerBox &&
      headerBox &&
      bannerBox.y + bannerBox.height <= headerBox.y + 1
    ),
    count: await banner.count(),
    href: await banner
      .getByRole("link", { name: "Explore Next Hydra" })
      .getAttribute("href"),
    message: await banner.textContent(),
  };
}

When("I visit the homepage and the registration page", async ({ page }) => {
  const homepage = await observe(page, "/");
  const registration = await observe(page, "/register");
  observations.set(page, [homepage, registration]);
});

Then("each page shows one demo announcement above its header", ({ page }) => {
  const results = observations.get(page);
  expect(results).toHaveLength(2);
  for (const result of results ?? []) {
    expect(result.count).toBe(1);
    expect(result.message).toContain("This is a Next Hydra template demo.");
    expect(result.aboveHeader).toBe(true);
  }
});

Then("the announcement links to the Next Hydra website", ({ page }) => {
  for (const result of observations.get(page) ?? []) {
    expect(result.href).toBe("https://next-hydra.dev");
  }
});
