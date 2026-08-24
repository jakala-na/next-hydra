import {
  PrivateDotEnvFile,
  PrivateDotEnvFileReceipt,
} from "@repo/cli-core/private-dotenv";
import { Effect, Layer, Redacted, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  AuthProvisioningInputError,
  AuthWebhookProvisioner,
  ProvisionedAuthWebhook,
  authWebhookUrl,
  provisionAuth,
} from "./provisioning";

describe("auth provisioning contract", () => {
  it("publishes only the provider-owned signing secret and returns a safe receipt", async () => {
    type Publish = Parameters<typeof PrivateDotEnvFile.of>[0]["publish"];
    const publish = vi.fn<Publish>(() =>
      Effect.succeed(
        new PrivateDotEnvFileReceipt({
          mode: 0o600,
          path: "/workspace/auth.env",
        })
      )
    );
    const layer = Layer.merge(
      Layer.succeed(
        AuthWebhookProvisioner,
        AuthWebhookProvisioner.of({
          provision: () =>
            Effect.succeed(
              new ProvisionedAuthWebhook({
                action: "created",
                endpointId: "ep_123",
                endpointUrl: "https://api.example.com/api/webhooks/clerk",
                events: ["user.created"],
                provider: "clerk",
                signingSecret: Redacted.make("whsec_secret", {
                  label: "authWebhookSigningSecret",
                }),
                signingSecretEnvironmentVariable: "CLERK_WEBHOOK_SECRET",
              })
            ),
        })
      ),
      Layer.succeed(PrivateDotEnvFile, PrivateDotEnvFile.of({ publish }))
    );

    const receipt = await provisionAuth({
      apiUrl: "https://api.example.com",
      output: "auth.env",
    }).pipe(Effect.provide(layer), Effect.runPromise);

    expect(publish).toHaveBeenCalledExactlyOnceWith(
      { CLERK_WEBHOOK_SECRET: "whsec_secret" },
      "auth.env"
    );
    expect(receipt).toMatchObject({
      action: "created",
      endpointId: "ep_123",
      provider: "clerk",
    });
    expect(JSON.stringify(receipt)).not.toContain("whsec_secret");
  });

  it("requires a public HTTPS API URL", async () => {
    const error = await authWebhookUrl(
      "http://localhost:3002",
      "/api/webhooks/clerk"
    ).pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningInputError)(error)).toBeTruthy();
  });
});
