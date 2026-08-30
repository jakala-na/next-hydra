import type { APIRequestContext, Page } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";

/* oxlint-disable typescript/no-empty-interface, typescript/no-empty-object-type -- This declaration-merging contract lets domain-owned step packages describe fixtures without making the shared package own their implementations. */

export interface E2EApplicationUrls {
  readonly admin: string;
  readonly api: string;
  readonly web: string;
}

export interface E2EFixtures {
  readonly adminPage: Page;
  readonly apiRequest: APIRequestContext;
}

export const e2eApplicationUrlsFromEnvironment = (
  environment: NodeJS.ProcessEnv = process.env
): E2EApplicationUrls => ({
  admin: environment.E2E_ADMIN_URL ?? "http://localhost:3005",
  api: environment.E2E_API_URL ?? "http://localhost:3002",
  web: environment.E2E_WEB_URL ?? "http://localhost:3001",
});

export const test = base.extend<E2EFixtures>({});

export const { Given, Then, When } = createBdd(test);

export { expect } from "@playwright/test";
export { DataTable } from "playwright-bdd";
export type {
  APIRequestContext,
  BrowserContext,
  Locator,
  Page,
} from "@playwright/test";
