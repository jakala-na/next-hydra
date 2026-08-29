import type { E2EApplicationUrls } from "@repo/e2e-testing";

interface ApplicationResponse {
  readonly status: () => number;
}

interface AssertE2EApplicationsAreRunningInput {
  readonly get: (
    url: string,
    options: { readonly timeout: number }
  ) => Promise<ApplicationResponse>;
  readonly isCI: boolean;
  readonly urls: E2EApplicationUrls;
}

export const assertE2EApplicationsAreRunning = async ({
  get,
  isCI,
  urls,
}: AssertE2EApplicationsAreRunningInput): Promise<void> => {
  const applications = [
    ["web", urls.web],
    ["API", new URL("/health", urls.api).href],
    ["admin", urls.admin],
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
