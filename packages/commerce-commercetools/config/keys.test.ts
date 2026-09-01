import { afterEach, describe, expect, it, vi } from "vitest";

import { keys, serverKeys } from "./keys";

const serverEnvironment = {
  COMMERCETOOLS_CLIENT_ID: "client-id",
  COMMERCETOOLS_CLIENT_SECRET: "client-secret",
  COMMERCETOOLS_PROJECT_KEY: "project-key",
  COMMERCETOOLS_REGION: "region",
  COMMERCETOOLS_SCOPE: "manage_payments:project-key",
} as const;

const stubValidEnvironment = () => {
  for (const [name, value] of Object.entries(serverEnvironment)) {
    vi.stubEnv(name, value);
  }
};

describe("Commercetools environment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads the provider server environment", () => {
    stubValidEnvironment();

    const environment = keys();
    expect(environment).toStrictEqual(serverEnvironment);
    expect(environment).not.toHaveProperty(
      "NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY"
    );
    expect(environment).not.toHaveProperty("NEXT_PUBLIC_COMMERCETOOLS_REGION");
  });

  it.each(Object.keys(serverEnvironment))(
    "requires %s to be non-empty",
    (name) => {
      vi.spyOn(console, "error").mockReturnValue();
      stubValidEnvironment();
      vi.stubEnv(name, "");

      expect(serverKeys).toThrow("Invalid environment variables");
    }
  );

  it("requires permission to manage Payment objects", () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    stubValidEnvironment();
    vi.stubEnv("COMMERCETOOLS_SCOPE", "manage_orders:project-key");

    expect(serverKeys).toThrow("Invalid environment variables");
    expect(consoleError).toHaveBeenCalledWith(
      "❌ Invalid environment variables:",
      expect.arrayContaining([
        expect.objectContaining({ path: ["COMMERCETOOLS_SCOPE"] }),
      ])
    );
  });
});
