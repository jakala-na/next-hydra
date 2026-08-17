import { StoreKey } from "@repo/commerce/store";
import { RegistrationId } from "@repo/registration";
import { CreateRegistrationRequest } from "@repo/registration/http/registration-api";
import { RegistrationApiErrorFailure } from "@repo/registration/public-errors";
import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("server-only"), () => ({}));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- The real env module requires unrelated application secrets during this isolated adapter test.
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_API_URL: "http://registration.test" },
}));

const { makeRegistrationRestClient, RegistrationHttpResponseError } =
  await import("./registration-rest-client");

const request = new CreateRegistrationRequest({
  address: {
    city: "New York",
    country: "US",
    postalCode: "10001",
    region: "NY",
    streetName: "1 Main Street",
  },
  companyName: "Hydra Supply",
  companyPhone: "555-0100",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  vatId: "US123",
});

const createRegistration = Effect.gen(function* createRegistrationEffect() {
  const client = yield* makeRegistrationRestClient();

  return yield* client.registrations.create({
    headers: { "x-context-locale": "en-US" },
    payload: request,
  });
});

const runCreate = async (fetch: typeof globalThis.fetch) =>
  await Effect.runPromise(
    createRegistration.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch))
  );

const runCreateError = async (fetch: typeof globalThis.fetch) =>
  await Effect.runPromise(
    createRegistration.pipe(
      Effect.flip,
      Effect.provideService(FetchHttpClient.Fetch, fetch)
    )
  );

const fetchResponse =
  (response: Response): typeof globalThis.fetch =>
  async () =>
    await Promise.resolve(response);

const failedFetch: typeof globalThis.fetch = async () =>
  await Promise.reject(new TypeError("fetch failed"));

describe("makeRegistrationRestClient", () => {
  it("classifies a success response that violates its schema", async () => {
    const fetch = fetchResponse(
      Response.json(
        {
          registrationId: RegistrationId.make("registration-1"),
          status: "awaiting_approval",
        },
        {
          status: 201,
        }
      )
    );

    const error = await runCreateError(fetch);

    expect(error).toBeInstanceOf(RegistrationHttpResponseError);
    if (!(error instanceof RegistrationHttpResponseError)) {
      throw new Error("Expected a classified registration response error");
    }
    expect(Schema.isSchemaError(error.cause)).toBeTruthy();
  });

  it("preserves a declared public API error", async () => {
    const publicError = RegistrationApiErrorFailure.make({
      message: "Registration is temporarily unavailable.",
      retryAfterSeconds: 17,
    });
    const fetch = fetchResponse(
      Response.json(publicError, {
        status: 503,
      })
    );

    const error = await runCreateError(fetch);

    expect(error).toStrictEqual(publicError);
  });

  it("leaves a pre-response transport failure as an HTTP client error", async () => {
    const error = await runCreateError(failedFetch);

    expect(error).toMatchObject({
      _tag: "HttpClientError",
      reason: { _tag: "TransportError" },
    });
    expect(error).not.toBeInstanceOf(RegistrationHttpResponseError);
  });

  it("decodes a valid success response", async () => {
    const fetch = fetchResponse(
      Response.json(
        {
          registrationId: RegistrationId.make("registration-1"),
          status: "awaiting_approval",
          storeKey: StoreKey.make("default-store"),
        },
        {
          status: 201,
        }
      )
    );

    await expect(runCreate(fetch)).resolves.toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
      status: "awaiting_approval",
      storeKey: StoreKey.make("default-store"),
    });
  });
});
