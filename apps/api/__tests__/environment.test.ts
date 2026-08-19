// @vitest-environment node

import { describe, expect, it } from "vitest";

import { apiServerEnvSchema } from "../env-schema";

describe("API registration environment schema", () => {
  it("requires a valid approver email", () => {
    expect(
      apiServerEnvSchema.parse({
        REGISTRATION_APPROVER_EMAIL: "approver@example.com",
      }).REGISTRATION_APPROVER_EMAIL
    ).toBe("approver@example.com");
  });

  it("rejects an invalid approver email", () => {
    expect(() =>
      apiServerEnvSchema.parse({
        REGISTRATION_APPROVER_EMAIL: "not-an-email",
      })
    ).toThrow(/invalid/iu);
  });
});
