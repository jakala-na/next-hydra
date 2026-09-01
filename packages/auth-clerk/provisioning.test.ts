import {
  AuthProvisioningConflict,
  AuthProvisioningProviderFailure,
} from "@repo/auth-contract/provisioning";
import { Effect, Redacted, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  CLERK_WEBHOOK_EVENTS,
  makeClerkAuthWebhookProvisioner,
} from "./provisioning";

const managementUrl = () => {
  const key = Buffer.from(
    JSON.stringify({
      appId: "app_123",
      oneTimeToken: "ott_123",
      region: "us",
    })
  ).toString("base64url");
  return `https://app.svix.com/login#key=${key}`;
};

type JsonPrimitive = boolean | null | number | string;
type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

const response = (body: JsonValue, status = 200) =>
  Response.json(body, { status });

type ClerkDependencies = Parameters<typeof makeClerkAuthWebhookProvisioner>[0];
type ClerkSvixClient = ReturnType<ClerkDependencies["makeSvixClient"]>;

describe("Clerk auth webhook provisioning", () => {
  it("creates the deterministic customer webhook with every handled event", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ svix_url: managementUrl() }))
      .mockResolvedValueOnce(response({ token: "svix_session" }));
    const createEndpoint = vi.fn<ClerkSvixClient["createEndpoint"]>(
      async (_appId, input) =>
        await Promise.resolve({
          ...input,
          id: "ep_123",
        })
    );
    const makeSvixClient = vi.fn<ClerkDependencies["makeSvixClient"]>(() => ({
      createEndpoint,
      getEndpointSecret: vi.fn<ClerkSvixClient["getEndpointSecret"]>(
        async () => await Promise.resolve("whsec_clerk")
      ),
      listEndpoints: vi.fn<ClerkSvixClient["listEndpoints"]>(
        async () => await Promise.resolve({ data: [], done: true })
      ),
    }));
    const provisioner = makeClerkAuthWebhookProvisioner({
      fetch,
      makeSvixClient,
      secretKey: Redacted.make("sk_test_clerk"),
    });

    const receipt = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.runPromise);

    expect(receipt.action).toBe("created");
    expect(receipt.endpointUrl).toBe(
      "https://api.example.com/api/webhooks/clerk"
    );
    expect(receipt.events).toStrictEqual([...CLERK_WEBHOOK_EVENTS]);
    expect(createEndpoint).toHaveBeenCalledWith(
      "app_123",
      expect.objectContaining({
        description: "Customer authentication webhook",
        disabled: false,
        filterTypes: [...CLERK_WEBHOOK_EVENTS],
        metadata: { owner: "auth-provisioner", pool: "customer" },
        uid: "customer-auth-webhook",
        url: "https://api.example.com/api/webhooks/clerk",
      })
    );
  });

  it("refuses to modify a managed webhook that has drifted", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ svix_url: managementUrl() }))
      .mockResolvedValueOnce(response({ token: "svix_session" }));
    const createEndpoint = vi.fn<ClerkSvixClient["createEndpoint"]>();
    const provisioner = makeClerkAuthWebhookProvisioner({
      fetch,
      makeSvixClient: () => ({
        createEndpoint,
        getEndpointSecret: vi.fn<ClerkSvixClient["getEndpointSecret"]>(
          async () => await Promise.resolve("whsec_clerk")
        ),
        listEndpoints: vi.fn<ClerkSvixClient["listEndpoints"]>(
          async () =>
            await Promise.resolve({
              data: [
                {
                  disabled: true,
                  filterTypes: ["user.created"],
                  id: "ep_existing",
                  uid: "customer-auth-webhook",
                  url: "https://old.example.com/api/webhooks/clerk",
                },
              ],
              done: true,
            })
        ),
      }),
      secretKey: Redacted.make("sk_test_clerk"),
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningConflict)(error)).toBeTruthy();
    expect(createEndpoint).not.toHaveBeenCalled();
  });

  it("refuses to duplicate an unmanaged webhook at the destination URL", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ svix_url: managementUrl() }))
      .mockResolvedValueOnce(response({ token: "svix_session" }));
    const createEndpoint = vi.fn<ClerkSvixClient["createEndpoint"]>();
    const provisioner = makeClerkAuthWebhookProvisioner({
      fetch,
      makeSvixClient: () => ({
        createEndpoint,
        getEndpointSecret: vi.fn<ClerkSvixClient["getEndpointSecret"]>(),
        listEndpoints: vi.fn<ClerkSvixClient["listEndpoints"]>(
          async () =>
            await Promise.resolve({
              data: [
                {
                  disabled: false,
                  filterTypes: [...CLERK_WEBHOOK_EVENTS],
                  id: "ep_manual",
                  url: "https://api.example.com/api/webhooks/clerk",
                },
              ],
              done: true,
            })
        ),
      }),
      secretKey: Redacted.make("sk_test_clerk"),
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningConflict)(error)).toBeTruthy();
    expect(createEndpoint).not.toHaveBeenCalled();
  });

  it("does not convert Clerk authorization failures into protocol errors", async () => {
    const provisioner = makeClerkAuthWebhookProvisioner({
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response({ errors: [] }, 401)),
      makeSvixClient: vi.fn<ClerkDependencies["makeSvixClient"]>(),
      secretKey: Redacted.make("sk_test_clerk"),
    });

    const error = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.flip, Effect.runPromise);

    expect(Schema.is(AuthProvisioningProviderFailure)(error)).toBeTruthy();
  });

  it("recovers when another provisioner creates the Svix application", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({ errors: [{ code: "svix_app_missing" }] }, 400)
      )
      .mockResolvedValueOnce(
        response({ errors: [{ code: "svix_app_exists" }] }, 400)
      )
      .mockResolvedValueOnce(response({ svix_url: managementUrl() }))
      .mockResolvedValueOnce(response({ token: "svix_session" }));
    const provisioner = makeClerkAuthWebhookProvisioner({
      fetch,
      makeSvixClient: () => ({
        createEndpoint: vi.fn<ClerkSvixClient["createEndpoint"]>(),
        getEndpointSecret: vi.fn<ClerkSvixClient["getEndpointSecret"]>(
          async () => await Promise.resolve("whsec_clerk")
        ),
        listEndpoints: vi.fn<ClerkSvixClient["listEndpoints"]>(
          async () =>
            await Promise.resolve({
              data: [
                {
                  disabled: false,
                  filterTypes: [...CLERK_WEBHOOK_EVENTS],
                  id: "ep_existing",
                  uid: "customer-auth-webhook",
                  url: "https://api.example.com/api/webhooks/clerk",
                },
              ],
              done: true,
            })
        ),
      }),
      secretKey: Redacted.make("sk_test_clerk"),
    });

    const receipt = await provisioner
      .provision({ apiUrl: "https://api.example.com" })
      .pipe(Effect.runPromise);

    expect(receipt.action).toBe("unchanged");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
