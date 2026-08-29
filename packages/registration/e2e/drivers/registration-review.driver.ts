import { expect } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";

type ReviewStatus = "approved" | "awaiting_approval";

interface RegistrationReviewTarget {
  readonly companyName: string;
  readonly email: string;
  readonly registrationId: string;
}

const reviewUrl = (target: RegistrationReviewTarget, status: ReviewStatus) => {
  const params = new URLSearchParams({
    registrationId: target.registrationId,
    search: target.email,
    status,
  });
  return `/registration-approvals?${params.toString()}`;
};

export class RegistrationReviewDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async approve(target: RegistrationReviewTarget): Promise<void> {
    await this.#page.goto(reviewUrl(target, "awaiting_approval"));
    const review = this.#review(target);
    await expect(review).toBeVisible();
    await review
      .getByRole("button", { exact: true, name: "Approve registration" })
      .click();
    await expect(
      this.#page.getByText("Registration approval processing.", {
        exact: true,
      })
    ).toBeVisible();
  }

  async expectAwaitingOnboarding(
    target: RegistrationReviewTarget
  ): Promise<void> {
    await expect(async () => {
      await this.#page.goto(reviewUrl(target, "approved"));
      const review = this.#review(target);
      await expect(review).toBeVisible({
        timeout: 1000,
      });
      await expect(review.getByText("Approved", { exact: true })).toBeVisible({
        timeout: 1000,
      });
      await expect(review.getByText("Invitation", { exact: true })).toBeVisible(
        {
          timeout: 1000,
        }
      );
    }).toPass({ intervals: [500, 1000, 2000], timeout: 30_000 });
  }

  #review(target: RegistrationReviewTarget) {
    return this.#page
      .getByRole("dialog")
      .filter({
        has: this.#page.getByRole("heading", {
          exact: true,
          name: target.companyName,
        }),
      })
      .filter({
        has: this.#page.getByText(`Registration ID ${target.registrationId}`, {
          exact: true,
        }),
      });
  }
}
