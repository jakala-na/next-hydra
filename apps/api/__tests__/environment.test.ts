// @vitest-environment node

import { describe, expect, it } from "vitest";

import { apiServerEnvSchema } from "../env-schema";

describe("API registration environment schema", () => {
  it("requires valid approver and admin application configuration", () => {
    expect(
      apiServerEnvSchema.parse({
        ADMIN_URL: "https://admin.example.com",
        REGISTRATION_APPROVER_EMAIL: "approver@example.com",
      })
    ).toStrictEqual({
      ADMIN_URL: "https://admin.example.com",
      REGISTRATION_APPROVER_EMAIL: "approver@example.com",
    });
  });

  it("rejects an invalid approver email", () => {
    expect(() =>
      apiServerEnvSchema.parse({
        ADMIN_URL: "https://admin.example.com",
        REGISTRATION_APPROVER_EMAIL: "not-an-email",
      })
    ).toThrow(/invalid/iu);
  });

  it("rejects an invalid admin application URL", () => {
    expect(() =>
      apiServerEnvSchema.parse({
        ADMIN_URL: "not-a-url",
        REGISTRATION_APPROVER_EMAIL: "approver@example.com",
      })
    ).toThrow(/invalid/iu);
  });
});
