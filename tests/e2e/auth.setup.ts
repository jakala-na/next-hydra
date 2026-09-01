import { request } from "@playwright/test";

import { assertE2EApplicationsAreRunning } from "./application-health";

const applicationUrl = (name: string): string => {
  const url = process.env[name];
  if (!url) {
    throw new Error(
      `${name} was not resolved by the Playwright configuration.`
    );
  }

  return url;
};

const assertApplicationsAreRunning = async (): Promise<void> => {
  const api = await request.newContext({ ignoreHTTPSErrors: true });

  try {
    await assertE2EApplicationsAreRunning({
      get: api.get.bind(api),
      isCI: Boolean(process.env.CI),
      urls: {
        admin: applicationUrl("E2E_ADMIN_URL"),
        api: applicationUrl("E2E_API_URL"),
        web: applicationUrl("E2E_WEB_URL"),
      },
    });
  } finally {
    await api.dispose();
  }
};

const setupAuth = async () => {
  await assertApplicationsAreRunning();
  const { setupAuthTesting } = await import("@repo/auth/testing");
  await setupAuthTesting();
};

export default setupAuth;
