import { afterEach, describe, expect, it, vi } from "vitest";

import { keys, serverKeys } from "./keys";

const serverEnvironment = {
  COMMERCETOOLS_CLIENT_ID: "client-id",
  COMMERCETOOLS_CLIENT_SECRET: "client-secret",
  COMMERCETOOLS_PROJECT_KEY: "project-key",
  COMMERCETOOLS_REGION: "region",
  COMMERCETOOLS_SCOPE: "scope",
} as const;

const stubValidEnvironment = () => {
  for (const [name, value] of Object.entries(serverEnvironment)) {
    vi.stubEnv(name, value);
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Commercetools environment", () => {
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

      expect(serverKeys).toThrow();
    }
  );
});
