import { expect } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";

export class StripeCardPaymentEntryDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async enterValidDetails(): Promise<void> {
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

    await cardFrame.getByLabel("Card number").fill("4242424242424242");
    await cardFrame.getByLabel("Expiration date").fill("12/35");
    await cardFrame.getByLabel("Security code").fill("123");
  }
}
