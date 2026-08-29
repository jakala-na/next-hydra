import { describe, expect, it, vi } from "vitest";

import { assertE2EApplicationsAreRunning } from "./application-health";

const urls = {
  admin: "https://admin.customer-project.localhost",
  api: "https://api.customer-project.localhost",
  web: "https://web.customer-project.localhost",
} as const;
type GetApplication = (
  url: string,
  options: { readonly timeout: number }
) => Promise<{ readonly status: () => number }>;

describe(assertE2EApplicationsAreRunning, () => {
  it("checks each application through its public health URL", async () => {
    const get = vi.fn<GetApplication>(async () => {
      const response = await Promise.resolve({ status: () => 200 });
      return response;
    });

    await assertE2EApplicationsAreRunning({ get, isCI: false, urls });

    expect(get.mock.calls).toEqual([
      [urls.web, { timeout: 10_000 }],
      [`${urls.api}/health`, { timeout: 10_000 }],
      [urls.admin, { timeout: 10_000 }],
    ]);
  });

  it("explains how to start a missing local application", async () => {
    const get = vi.fn<GetApplication>(async () => {
      await Promise.reject(new Error("connection refused"));
      return { status: () => 200 };
    });

    await expect(
      assertE2EApplicationsAreRunning({ get, isCI: false, urls })
    ).rejects.toThrow(
      `The web application is not available at ${urls.web}. Start the workspace with \`pnpm dev\` before running E2E tests.`
    );
  });

  it("does not give local startup advice in CI", async () => {
    const get = vi.fn<GetApplication>(async () => {
      const response = await Promise.resolve({ status: () => 404 });
      return response;
    });

    await expect(
      assertE2EApplicationsAreRunning({ get, isCI: true, urls })
    ).rejects.toThrow(`The web application is not available at ${urls.web}.`);
  });
});
