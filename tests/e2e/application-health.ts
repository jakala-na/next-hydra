import { request } from "@playwright/test";
import type { FullConfig } from "@playwright/test";
import { Schema } from "effect";

import type { E2EApplicationNames } from "./application-routing";

interface ApplicationResponse {
  readonly status: () => number;
}

interface AssertE2EApplicationsAreRunningInput {
  readonly get: (
    url: string,
    options: { readonly timeout: number }
  ) => Promise<ApplicationResponse>;
  readonly isCI: boolean;
  readonly urls: E2EApplicationNames;
}

export const assertE2EApplicationsAreRunning = async ({
  get,
  isCI,
  urls,
}: AssertE2EApplicationsAreRunningInput): Promise<void> => {
  const applications = [
    ["web", urls.web],
    ...(urls.api ? [["API", new URL("/health", urls.api).href] as const] : []),
    ...(urls.admin ? [["admin", urls.admin] as const] : []),
  ] as const;

  await Promise.all(
    applications.map(async ([application, url]) => {
      try {
        const response = await get(url, { timeout: 10_000 });
        if (response.status() >= 400) {
          throw new Error(`received HTTP ${response.status()}`);
        }
      } catch (error) {
        const localHelp = isCI
          ? ""
          : " Start the workspace with `pnpm dev` before running E2E tests.";

        throw new Error(
          `The ${application} application is not available at ${url}.${localHelp}`,
          { cause: error }
        );
      }
    })
  );
};

export async function checkApplicationHealth(
  config: FullConfig
): Promise<void> {
  const urls = Schema.decodeUnknownSync(
    Schema.Struct({
      admin: Schema.optional(Schema.String),
      api: Schema.optional(Schema.String),
      web: Schema.String,
    })
  )(config.metadata.applicationUrls);
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    await assertE2EApplicationsAreRunning({
      get: api.get.bind(api),
      isCI: Boolean(process.env.CI),
      urls,
    });
  } finally {
    await api.dispose();
  }
}
