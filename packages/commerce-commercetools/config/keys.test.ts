// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { serverKeys } from "./keys";
import { runtimeScopeFor } from "./runtime-scopes";

const projectKey = "test-project";

const stubEnvironment = (scope = runtimeScopeFor(projectKey)) => {
  vi.stubEnv("COMMERCETOOLS_CLIENT_ID", "test-client");
  vi.stubEnv("COMMERCETOOLS_CLIENT_SECRET", "test-secret");
  vi.stubEnv("COMMERCETOOLS_PROJECT_KEY", projectKey);
  vi.stubEnv("COMMERCETOOLS_REGION", "us-central1.gcp");
  vi.stubEnv("COMMERCETOOLS_SCOPE", scope);
};

describe("Commercetools environment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads credentials with every required runtime scope", () => {
    stubEnvironment();

    expect(serverKeys()).toMatchObject({
      COMMERCETOOLS_PROJECT_KEY: projectKey,
      COMMERCETOOLS_SCOPE: runtimeScopeFor(projectKey),
    });
  });

  it("reports every missing runtime scope at the scope variable", () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    stubEnvironment(`view_states:${projectKey}`);

    expect(serverKeys).toThrow("Invalid environment variables");
    expect(consoleError).toHaveBeenCalledWith(
      "❌ Invalid environment variables:",
      expect.arrayContaining([
        expect.objectContaining({
          path: ["COMMERCETOOLS_SCOPE"],
        }),
      ])
    );
    expect(JSON.stringify(consoleError.mock.calls)).toContain(
      `manage_payments:${projectKey}`
    );
  });
});
