import {
  AuthProvisioningConflict,
  AuthProvisioningOutcomeUnknown,
  AuthProvisioningProviderFailure,
} from "@repo/auth-contract/provisioning";
import { Effect, Redacted, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  WORKOS_WEBHOOK_EVENTS,
  makeWorkosAuthWebhookProvisioner,
} from "./provisioning";

type JsonPrimitive = boolean | null | number | string;
type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

const response = (body: JsonValue, status = 200) =>
  Response.json(body, { status });

const listResponse = (data: readonly JsonValue[]) =>
  response({ data, list_metadata: { after: null } });

describe("WorkOS auth webhook provisioning", () => {
  it("creates the customer webhook with only the handled invitation events", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(
        response({
          endpoint_url: "https://api.example.com/api/webhooks/workos",
          events: [...WORKOS_WEBHOOK_EVENTS],
          id: "we_123",
          secret: "whsec_workos",
          status: "enabled",
        })
      );
    const provisioner = makeWorkosAuthWebhookProvisioner({
      apiKey: Redacted.make("sk_test_workos"),
      fetch,
    });

    const receipt = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.runPromise);

    expect(receipt.action).toBe("created");
    expect(receipt.endpointId).toBe("we_123");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.workos.com/webhook_endpoints",
      expect.objectContaining({
        body: JSON.stringify({
          endpoint_url: "https://api.example.com/api/webhooks/workos",
          events: WORKOS_WEBHOOK_EVENTS,
        }),
        method: "POST",
      })
    );
  });

  it("acknowledges an exact existing endpoint without creating a duplicate", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      listResponse([
        {
          endpoint_url: "https://api.example.com/api/webhooks/workos",
          events: [...WORKOS_WEBHOOK_EVENTS],
          id: "we_existing",
          secret: "whsec_workos",
          status: "enabled",
        },
      ])
    );
    const provisioner = makeWorkosAuthWebhookProvisioner({
      apiKey: Redacted.make("sk_test_workos"),
      fetch,
    });

    const receipt = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.runPromise);

    expect(receipt.action).toBe("unchanged");
    expect(receipt.endpointId).toBe("we_existing");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("surfaces drift instead of rotating the WorkOS secret destructively", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      listResponse([
        {
          endpoint_url: "https://api.example.com/api/webhooks/workos",
          events: ["invitation.accepted"],
          id: "we_existing",
          secret: "whsec_workos",
          status: "enabled",
        },
      ])
    );
    const provisioner = makeWorkosAuthWebhookProvisioner({
      apiKey: Redacted.make("sk_test_workos"),
      fetch,
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningConflict)(error)).toBeTruthy();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports an unknown outcome when webhook creation loses its response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(listResponse([]))
      .mockRejectedValueOnce(new TypeError("connection closed"));
    const provisioner = makeWorkosAuthWebhookProvisioner({
      apiKey: Redacted.make("sk_test_workos"),
      fetch,
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningOutcomeUnknown)(error)).toBeTruthy();
  });

  it("reports an unknown outcome for an invalid successful create response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(response({}));
    const provisioner = makeWorkosAuthWebhookProvisioner({
      apiKey: Redacted.make("sk_test_workos"),
      fetch,
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningOutcomeUnknown)(error)).toBeTruthy();
  });

  it("keeps WorkOS API failures distinct from response schema failures", async () => {
    const provisioner = makeWorkosAuthWebhookProvisioner({
      apiKey: Redacted.make("sk_test_workos"),
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response({}, 403)),
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningProviderFailure)(error)).toBeTruthy();
  });
});
