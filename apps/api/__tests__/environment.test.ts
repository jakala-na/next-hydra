// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/analytics/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/auth/keys", () => ({
  keys: () => ({}),
  webhookKeys: () => ({}),
}));
vi.mock("@repo/email/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/next-config/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/observability/keys", () => ({ keys: () => ({}) }));

const requiredCommerceEnvironment = {
  COMMERCETOOLS_CLIENT_ID: "client-id",
  COMMERCETOOLS_CLIENT_SECRET: "client-secret",
  COMMERCETOOLS_PROJECT_KEY: "project-key",
  COMMERCETOOLS_REGION: "region",
  COMMERCETOOLS_SCOPE: "scope",
} as const;

const applicationEnvironment = {
  REGISTRATION_APPROVAL_SECRET: "registration-approval-secret",
  REGISTRATION_APPROVER_EMAIL: "approver@example.com",
  WORKOS_WEBHOOK_SECRET: "workos-webhook-secret",
} as const;

const stubValidEnvironment = () => {
  for (const [name, value] of Object.entries({
    ...requiredCommerceEnvironment,
    ...applicationEnvironment,
  })) {
    vi.stubEnv(name, value);
  }
};

const loadEnvironment = () => import("../env");

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("API commerce environment", () => {
  it("loads all five server-only Commercetools values", async () => {
    stubValidEnvironment();

    const { env } = await loadEnvironment();

    expect(env.COMMERCETOOLS_PROJECT_KEY).toBe("project-key");
    expect(env.COMMERCETOOLS_CLIENT_ID).toBe("client-id");
    expect(env.COMMERCETOOLS_CLIENT_SECRET).toBe("client-secret");
    expect(env.COMMERCETOOLS_SCOPE).toBe("scope");
    expect(env.COMMERCETOOLS_REGION).toBe("region");
  });

  it.each(Object.keys(requiredCommerceEnvironment))(
    "fails while loading the API environment when %s is empty",
    async (name) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      stubValidEnvironment();
      vi.stubEnv(name, "");

      await expect(loadEnvironment()).rejects.toThrow(
        "Invalid environment variables"
      );
    }
  );
});
