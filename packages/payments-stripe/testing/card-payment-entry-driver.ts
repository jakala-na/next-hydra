import { expect } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";

export class StripeCardPaymentEntryDriver {
  #authenticationExpectations = 0;
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async #enterDetails(cardNumber: string): Promise<void> {
    const frameWithCardDetails = async () => {
      const frames = this.#page.frames();
      const cardFieldCounts = await Promise.all(
        frames.map(
          async (frame) => await frame.getByLabel("Card number").count()
        )
      );
      return frames.find((_, index) => (cardFieldCounts[index] ?? 0) > 0);
    };
    await expect.poll(frameWithCardDetails).not.toBeUndefined();
    const cardFrame = await frameWithCardDetails();
    if (cardFrame === undefined) {
      throw new Error("Stripe Card input frame is unavailable");
    }

    await cardFrame.getByLabel("Card number").fill(cardNumber);
    await cardFrame.getByLabel("Expiration date").fill("12/35");
    await cardFrame.getByLabel("Security code").fill("123");
  }

  async cancelAuthentication(): Promise<void> {
    const actions = this.#page
      .frames()
      .map((frame) => frame.getByRole("button", { name: /Close|Cancel/u }));
    const available = await Promise.all(
      actions.map(async (button) => await button.count())
    );
    const button = actions.find((_, index) => (available[index] ?? 0) > 0);
    if (button === undefined) {
      throw new Error("Stripe authentication cancel action is unavailable");
    }
    await button.click();
  }

  async enterAuthenticationRequiredDetails(): Promise<void> {
    await this.#enterDetails("4000000000003220");
  }

  async enterValidDetails(): Promise<void> {
    await this.#enterDetails("4242424242424242");
  }

  async expectAuthenticationRequired(): Promise<void> {
    this.#authenticationExpectations += 1;
    try {
      await expect
        .poll(
          async () => {
            const counts = await Promise.all(
              this.#page
                .frames()
                .map(
                  async (frame) =>
                    await frame
                      .getByRole("button", { name: /Complete|Authorize/u })
                      .count()
                )
            );
            return counts.some((count) => count > 0);
          },
          { timeout: 15_000 }
        )
        .toBeTruthy();
    } catch (error) {
      const [alerts, buttons] = await Promise.all([
        this.#page.getByRole("alert").allTextContents(),
        this.#page.getByRole("button").allTextContents(),
      ]);
      throw new Error(
        `Stripe authentication action ${this.#authenticationExpectations} was unavailable; alerts=${JSON.stringify(alerts)} buttons=${JSON.stringify(buttons)}`,
        { cause: error }
      );
    }
  }
}
