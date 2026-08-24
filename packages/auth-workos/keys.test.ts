import { afterEach, describe, expect, it, vi } from "vitest";

import { adminKeys } from "./keys";

describe(adminKeys, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates the isolated WorkOS project credentials used by the API", () => {
    vi.stubEnv("ADMIN_WORKOS_API_KEY", "sk_test_admin");
    vi.stubEnv("ADMIN_WORKOS_CLIENT_ID", "client_test_admin");

    expect(adminKeys()).toMatchObject({
      ADMIN_WORKOS_API_KEY: "sk_test_admin",
      ADMIN_WORKOS_CLIENT_ID: "client_test_admin",
    });
  });

  it("does not fall back to the customer project credentials", () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_customer");
    vi.stubEnv("WORKOS_CLIENT_ID", "client_test_customer");

    expect(() => adminKeys()).toThrow("Invalid environment variables");
  });
});
