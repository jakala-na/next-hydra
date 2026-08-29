import { expect } from "@repo/e2e-testing";
import type { APIRequestContext } from "@repo/e2e-testing";
import { Schema } from "effect";

import { CreateRegistrationResponse } from "../../http/registration-api";

export interface SubmitRegistrationInput {
  readonly companyName: string;
  readonly email: string;
}

export class RegistrationApiDriver {
  readonly #request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.#request = request;
  }

  async submit(input: SubmitRegistrationInput): Promise<string> {
    const response = await this.#request.post("/registrations", {
      data: {
        address: {
          city: "New York",
          country: "US",
          postalCode: "10001",
          region: "NY",
          streetName: "1 E2E Way",
        },
        companyName: input.companyName,
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        email: input.email,
      },
      headers: { "x-context-locale": "en-US" },
    });

    const body: unknown = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(201);
    const created = Schema.decodeUnknownSync(CreateRegistrationResponse)(body);
    return String(created.registrationId);
  }
}
