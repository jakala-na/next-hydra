import { StoreKey } from "@repo/commerce/store";
import { RegistrationId } from "@repo/registration";
import { CreateRegistrationRequest } from "@repo/registration/http/registration-api";
import { RegistrationApiErrorFailure } from "@repo/registration/public-errors";
import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import {
  makeRegistrationRestClient,
  RegistrationHttpResponseError,
} from "./registration-rest-client";

const API_BASE_URL = "http://registration.test";

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
  const client = yield* makeRegistrationRestClient(undefined, API_BASE_URL);

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

describe("registration REST client", () => {
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
