import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { EmailProvider } from "./provider";

describe("EmailProvider", () => {
  it("records sent messages in the memory layer", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const email = yield* EmailProvider;

        const delivery = yield* email.send({
          to: "ada@example.com",
          subject: "Registration received",
          react: "Hello",
        });

        expect(delivery.providerMessageId).toBeNull();
      }).pipe(Effect.provide(EmailProvider.layerMemory))
    );
  });
});
