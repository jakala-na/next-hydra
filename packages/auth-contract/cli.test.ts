import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, FileSystem, Layer, Path, Redacted, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { makeAuthCommand } from "./cli";
import {
  AuthProvisioningOutcomeUnknown,
  AuthWebhookProvisioner,
  ProvisionedAuthWebhook,
  authWebhookRuntimeEnvironment,
} from "./provisioning";

const secret = "test-only-signing-secret";

describe("auth provision command output", () => {
  it.each([
    {
      provider: "clerk",
      label: "Clerk",
      key: "CLERK_WEBHOOK_SECRET",
      action: "created",
    },
    {
      provider: "workos",
      label: "WorkOS",
      key: "WORKOS_WEBHOOK_SECRET",
      action: "unchanged",
    },
  ] as const)(
    "shows a safe framed receipt for $provider ($action)",
    async ({ provider, label, key, action }) => {
      await Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const directory = yield* fs.makeTempDirectoryScoped({
            prefix: "auth-output-",
          });
          const outputFile = path.join(directory, "auth.env");
          const inputs: string[] = [];
          const layer = Layer.succeed(
            AuthWebhookProvisioner,
            AuthWebhookProvisioner.of({
              runtimeEnvironment: authWebhookRuntimeEnvironment(key),
              provision: ({ apiUrl }) =>
                Effect.sync(() => {
                  inputs.push(apiUrl);
                  return new ProvisionedAuthWebhook({
                    action,
                    endpointId: "endpoint-example",
                    endpointUrl: `${apiUrl}/api/webhooks/${provider}`,
                    events: ["user.created"],
                    provider,
                    signingSecret: Redacted.make(secret, {
                      label: "authWebhookSigningSecret",
                    }),
                    signingSecretEnvironmentVariable: key,
                  });
                }),
            })
          );
          const exit = yield* Command.runWith(makeAuthCommand(layer), {
            version: "0.0.0",
          })([
            "provision",
            "--api-url",
            "https://api.example.test",
            "--output",
            outputFile,
            "--yes",
          ]).pipe(Effect.exit);
          const stdout = (yield* TestConsole.logLines).join("\n");
          const stderr = (yield* TestConsole.errorLines).join("\n");
          if (Exit.isFailure(exit)) yield* Effect.failCause(exit.cause);
          expect(Exit.isSuccess(exit)).toBe(true);
          expect(stdout).toContain(`┌─ Identity · ${label}`);
          expect(stdout).toContain(`Status: ${action}`);
          expect(stdout).toContain("Where: apps/api");
          expect(stdout).not.toContain(secret);
          expect(stderr).not.toContain(secret);
          expect(stderr).toContain("OK  Identity");
          expect(inputs).toEqual(["https://api.example.test"]);
          expect(yield* fs.exists(outputFile)).toBe(true);
        })
      ).pipe(
        Effect.provide(NodeServices.layer),
        Effect.provide(TestConsole.layer),
        Effect.provide(
          Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(false) })
        ),
        Effect.runPromise
      );
    }
  );

  it("stops without a success report or credential file when the provider outcome is unknown", async () => {
    await Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({
          prefix: "auth-output-failed-",
        });
        const outputFile = path.join(directory, "auth.env");
        const layer = Layer.succeed(
          AuthWebhookProvisioner,
          AuthWebhookProvisioner.of({
            runtimeEnvironment: authWebhookRuntimeEnvironment(
              "WORKOS_WEBHOOK_SECRET"
            ),
            provision: () =>
              Effect.fail(
                new AuthProvisioningOutcomeUnknown({
                  provider: "workos",
                  operation: "create webhook",
                  message: "Creation outcome unknown",
                  cause: new Error("Connection closed"),
                })
              ),
          })
        );
        const exit = yield* Command.runWith(makeAuthCommand(layer), {
          version: "0.0.0",
        })([
          "provision",
          "--api-url",
          "https://api.example.test",
          "--output",
          outputFile,
          "--yes",
        ]).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        expect((yield* TestConsole.logLines).join("\n")).not.toContain(
          "┌─ Identity"
        );
        const stderr = (yield* TestConsole.errorLines).join("\n");
        expect(stderr).toContain("FAIL  Identity");
        expect(stderr).toContain("STOPPED");
        expect(yield* fs.exists(outputFile)).toBe(false);
      })
    ).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provide(TestConsole.layer),
      Effect.provide(
        Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(false) })
      ),
      Effect.runPromise
    );
  });
});
