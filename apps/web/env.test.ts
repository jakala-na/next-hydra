// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth-workos/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/cms/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/email/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/feature-flags/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/next-config/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/observability/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/rate-limit/keys", () => ({ keys: () => ({}) }));
vi.mock("@repo/security/keys", () => ({ keys: () => ({}) }));

const requiredCommerceEnvironment = {
  COMMERCETOOLS_PROJECT_KEY: "project-key",
  COMMERCETOOLS_CLIENT_ID: "client-id",
  COMMERCETOOLS_CLIENT_SECRET: "client-secret",
  COMMERCETOOLS_SCOPE: "scope",
  COMMERCETOOLS_REGION: "region",
} as const;

const stubRequiredCommerceEnvironment = () => {
  for (const [name, value] of Object.entries(requiredCommerceEnvironment)) {
    vi.stubEnv(name, value);
  }
};

const loadEnvironment = () => import("./env");

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Web commerce environment", () => {
  it("loads all five server-only Commercetools values", async () => {
    stubRequiredCommerceEnvironment();

    const { env } = await loadEnvironment();

    expect(env.COMMERCETOOLS_PROJECT_KEY).toBe("project-key");
    expect(env.COMMERCETOOLS_CLIENT_ID).toBe("client-id");
    expect(env.COMMERCETOOLS_CLIENT_SECRET).toBe("client-secret");
    expect(env.COMMERCETOOLS_SCOPE).toBe("scope");
    expect(env.COMMERCETOOLS_REGION).toBe("region");
  });

  it.each(
    Object.keys(requiredCommerceEnvironment)
  )("fails while loading the Web environment when %s is empty", async (name) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRequiredCommerceEnvironment();
    vi.stubEnv(name, "");

    await expect(loadEnvironment()).rejects.toThrow(
      "Invalid environment variables"
    );
  });
});
