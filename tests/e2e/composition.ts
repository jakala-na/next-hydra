import { createHash, randomUUID } from "node:crypto";

import { AuthContext } from "@repo/auth-contract/e2e/auth-context";
import { createAuthScenario } from "@repo/auth-contract/e2e/auth-scenario";
import type { AuthScenario } from "@repo/auth-contract/e2e/auth-scenario";
import { AuthTestControl } from "@repo/auth-contract/e2e/auth-test-control";
import type { companyMemberIdentityProjectionLayer as CompanyMemberIdentityProjectionLayer } from "@repo/auth/invitations";
import type {
  adminAuthTestControlLayer as AdminAuthTestControlLayer,
  authTestControlLayer as AuthTestControlLayer,
} from "@repo/auth/testing";
import type { commerceAccountsLayer as CommerceAccountsLayer } from "@repo/commerce-provider/commerce-accounts";
import type { commercetoolsClientsLayer as CommercetoolsClientsLayer } from "@repo/commerce-provider/provider";
import type {
  CommercetoolsRestClient,
  makeCommercetoolsJanitorFromApiRoot as MakeCommercetoolsJanitorFromApiRoot,
} from "@repo/commerce-provider/testing";
import {
  e2eApplicationUrlsFromEnvironment,
  test as base,
} from "@repo/e2e-testing";
import type { APIRequestContext, Page } from "@repo/e2e-testing";
import type { RegistrationTestData } from "@repo/registration/e2e/fixtures";
import { RegistrationContext } from "@repo/registration/e2e/registration-context";
import type { RegistrationContextOptions } from "@repo/registration/e2e/registration-context";
import { createRegistrationScenario } from "@repo/registration/e2e/registration-scenario";
import type { RegistrationScenario } from "@repo/registration/e2e/registration-scenario";
import { provisionCompanyMember } from "@repo/registration/programs/company-member-invitations";
import { provisionApprovedRegistration } from "@repo/registration/programs/registration-onboarding";
import { CompanyInvitationPolicy } from "@repo/registration/services/company-invitation-policy";
import { Effect, Layer, ManagedRuntime } from "effect";
import { createJiti } from "jiti";

interface AuthInvitationsModule {
  readonly companyMemberIdentityProjectionLayer: typeof CompanyMemberIdentityProjectionLayer;
}

interface AuthTestingModule {
  readonly adminAuthTestControlLayer: typeof AdminAuthTestControlLayer;
  readonly authTestControlLayer: typeof AuthTestControlLayer;
}

interface CommerceProviderAccountsModule {
  readonly commerceAccountsLayer: typeof CommerceAccountsLayer;
}

interface CommerceProviderModule {
  readonly commercetoolsClientsLayer: typeof CommercetoolsClientsLayer;
}

interface CommerceProviderTestingModule {
  readonly CommercetoolsRestClient: typeof CommercetoolsRestClient;
  readonly makeCommercetoolsJanitorFromApiRoot: typeof MakeCommercetoolsJanitorFromApiRoot;
}

interface E2EServices {
  readonly adminAuth: AuthTestControl["Service"];
  readonly customerAuth: AuthTestControl["Service"];
  readonly deleteCommerceAccount: RegistrationContextOptions["deleteCommerceAccount"];
  readonly deleteRegistration: RegistrationContextOptions["deleteRegistration"];
  readonly provisionCompany: RegistrationContextOptions["provisionCompany"];
  readonly provisionCompanyMember: RegistrationContextOptions["provisionCompanyMember"];
}

interface RegistrationFixtures {
  readonly registration: RegistrationContext;
  readonly registrationScenario: RegistrationScenario;
  readonly registrationTestData: RegistrationTestData;
}

interface E2EFixtures extends RegistrationFixtures {
  readonly adminPage: Page;
  readonly apiRequest: APIRequestContext;
  readonly auth: AuthContext;
  readonly authScenario: AuthScenario;
}

interface E2EWorkerFixtures {
  readonly e2eServices: E2EServices;
}

const liveModuleLoader = createJiti(import.meta.url);
const importLiveModule = async <Module>(specifier: string) =>
  await liveModuleLoader.import<Module>(specifier);

const emailPart = (value: string, maxLength: number) => {
  const normalized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, maxLength);

  return normalized.length === 0 ? "test" : normalized;
};

export const test = base.extend<E2EFixtures, E2EWorkerFixtures>({
  adminPage: async ({ browser }, provide) => {
    const { admin } = e2eApplicationUrlsFromEnvironment();
    const context = await browser.newContext({
      baseURL: admin,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      await provide(page);
    } finally {
      await context.close();
    }
  },
  apiRequest: async ({ playwright }, provide) => {
    const { api } = e2eApplicationUrlsFromEnvironment();
    const request = await playwright.request.newContext({
      baseURL: api,
      ignoreHTTPSErrors: true,
    });

    try {
      await provide(request);
    } finally {
      await request.dispose();
    }
  },
  auth: async ({ e2eServices, adminPage, authScenario, page }, provide) => {
    const urls = e2eApplicationUrlsFromEnvironment();
    const auth = new AuthContext({
      applications: {
        admin: {
          auth: e2eServices.adminAuth,
          page: adminPage,
          url: urls.admin,
        },
        web: {
          auth: e2eServices.customerAuth,
          page,
          url: urls.web,
        },
      },
      scenario: authScenario,
    });

    try {
      await provide(auth);
    } finally {
      await auth.dispose();
    }
  },
  authScenario: async ({ browserName: _browserName }, provide) => {
    await provide(createAuthScenario());
  },
  e2eServices: [
    async ({ browserName: _browserName }, provide) => {
      const [
        { companyMemberIdentityProjectionLayer },
        { adminAuthTestControlLayer, authTestControlLayer },
        { commerceAccountsLayer },
        { commercetoolsClientsLayer },
        { CommercetoolsRestClient, makeCommercetoolsJanitorFromApiRoot },
      ] = await Promise.all([
        importLiveModule<AuthInvitationsModule>("@repo/auth/invitations"),
        importLiveModule<AuthTestingModule>("@repo/auth/testing"),
        importLiveModule<CommerceProviderAccountsModule>(
          "@repo/commerce-provider/commerce-accounts"
        ),
        importLiveModule<CommerceProviderModule>(
          "@repo/commerce-provider/provider"
        ),
        importLiveModule<CommerceProviderTestingModule>(
          "@repo/commerce-provider/testing"
        ),
      ]);
      const liveRegistrationLayer = Layer.mergeAll(
        authTestControlLayer,
        commerceAccountsLayer,
        companyMemberIdentityProjectionLayer,
        commercetoolsClientsLayer,
        CompanyInvitationPolicy.layer
      );
      const runtime = ManagedRuntime.make(liveRegistrationLayer);
      const adminAuthRuntime = ManagedRuntime.make(adminAuthTestControlLayer);
      const [services, adminAuth] = await Promise.all([
        runtime.runPromise(
          Effect.gen(function* () {
            return {
              auth: yield* AuthTestControl,
              restClient: yield* CommercetoolsRestClient,
            };
          })
        ),
        adminAuthRuntime.runPromise(AuthTestControl),
      ]);
      const janitor = makeCommercetoolsJanitorFromApiRoot(
        services.restClient.apiRoot
      );

      try {
        await provide({
          adminAuth,
          customerAuth: services.auth,
          deleteCommerceAccount: janitor.deleteCommerceAccount,
          deleteRegistration: janitor.deleteRegistration,
          provisionCompany: async (input) =>
            await runtime.runPromise(provisionApprovedRegistration(input)),
          provisionCompanyMember: async (input) =>
            await runtime.runPromise(provisionCompanyMember(input)),
        });
      } finally {
        await Promise.all([adminAuthRuntime.dispose(), runtime.dispose()]);
      }
    },
    { scope: "worker" },
  ],
  registration: async ({ e2eServices, registrationTestData }, provide) => {
    const { StoreKey } = await import("@repo/commerce/store");
    const registration = new RegistrationContext({
      auth: e2eServices.customerAuth,
      deleteCommerceAccount: e2eServices.deleteCommerceAccount,
      deleteRegistration: e2eServices.deleteRegistration,
      provisionCompany: e2eServices.provisionCompany,
      provisionCompanyMember: e2eServices.provisionCompanyMember,
      storeKey: StoreKey.make(process.env.E2E_STORE_KEY ?? "default-store"),
      uniqueEmail: registrationTestData.uniqueEmail,
      uniqueId: registrationTestData.uniqueId,
    });

    try {
      await provide(registration);
    } finally {
      await registration.dispose();
    }
  },
  registrationScenario: async ({ browserName: _browserName }, provide) => {
    await provide(createRegistrationScenario());
  },
  registrationTestData: async ({ e2eServices }, provide, testInfo) => {
    const scenarioId = createHash("sha256")
      .update(testInfo.testId)
      .digest("hex")
      .slice(0, 8);
    const runId = emailPart(
      process.env.E2E_RUN_ID ??
        `${randomUUID()}-${testInfo.workerIndex}-${testInfo.retry}`,
      12
    );
    const uniqueSuffix = `${runId}-${scenarioId}`;

    await provide({
      uniqueEmail: (localPart) =>
        e2eServices.customerAuth.emailAddressFor(
          `${localPart}-${uniqueSuffix}`
        ),
      uniqueId: (prefix) => `${emailPart(prefix, 32)}-${uniqueSuffix}`,
    });
  },
});
