import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../env";

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("CLI commerce environment", () => {
  it("loads all five server-only Commercetools values", () => {
    stubRequiredCommerceEnvironment();

    const environment = env();

    expect(environment.COMMERCETOOLS_PROJECT_KEY).toBe("project-key");
    expect(environment.COMMERCETOOLS_CLIENT_ID).toBe("client-id");
    expect(environment.COMMERCETOOLS_CLIENT_SECRET).toBe("client-secret");
    expect(environment.COMMERCETOOLS_SCOPE).toBe("scope");
    expect(environment.COMMERCETOOLS_REGION).toBe("region");
  });

  it.each(
    Object.keys(requiredCommerceEnvironment)
  )("fails when the CLI resolves %s as empty", (name) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubRequiredCommerceEnvironment();
    vi.stubEnv(name, "");

    expect(env).toThrow("Invalid environment variables");
  });
});
