import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { EmailProvider } from "./email-provider";

describe("EmailProvider", () => {
  it.effect("records sent messages in the memory layer", () =>
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
