import {
  LocalRuntimeEnvironmentPublicationReceipt,
  RuntimeEnvironmentPublisher,
  RuntimeEnvironmentVariable,
} from "@repo/cli-core/runtime-environment";
import { Effect, Layer, Redacted, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  AuthProvisioningInputError,
  AuthWebhookProvisioner,
  ProvisionedAuthWebhook,
  authWebhookRuntimeEnvironment,
  authWebhookUrl,
  provisionAuth,
} from "./provisioning";

describe("auth provisioning contract", () => {
  it("routes webhook signing secrets to the API application", () => {
    expect(authWebhookRuntimeEnvironment("CLERK_WEBHOOK_SECRET")).toMatchObject(
      [
        {
          applications: ["api"],
          key: "CLERK_WEBHOOK_SECRET",
          sensitive: true,
        },
      ]
    );
  });

  it("publishes only the provider-owned signing secret and returns a safe receipt", async () => {
    type Publish = Parameters<
      typeof RuntimeEnvironmentPublisher.of
    >[0]["publish"];
    const publish = vi.fn<Publish>(() =>
      Effect.succeed(
        new LocalRuntimeEnvironmentPublicationReceipt({
          destination: "local",
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
          runtimeEnvironment: [
            new RuntimeEnvironmentVariable({
              applications: ["api"],
              key: "CLERK_WEBHOOK_SECRET",
              sensitive: true,
            }),
          ],
        })
      ),
      RuntimeEnvironmentPublisher.layerFrom({
        prepare: ({ manifest }) =>
          Effect.succeed({
            destination: "local" as const,
            manifest,
            path: "/workspace/auth.env",
          }),
        publish,
      })
    );

    const receipt = await provisionAuth({
      apiUrl: "https://api.example.com",
      destination: {
        destination: "local",
        output: "auth.env",
        publicationMode: "create",
        yes: true,
      },
    }).pipe(Effect.provide(layer), Effect.runPromise);

    const publishedValues = publish.mock.calls[0]?.[1];
    const signingSecret = publishedValues?.CLERK_WEBHOOK_SECRET;
    expect(Redacted.isRedacted(signingSecret)).toBeTruthy();
    if (!Redacted.isRedacted(signingSecret)) {
      throw new Error("Expected a redacted signing secret");
    }
    expect(Redacted.value(signingSecret)).toBe("whsec_secret");
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
