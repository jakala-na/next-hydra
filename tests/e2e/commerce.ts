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
  makeCommercetoolsNetTermsTestControl as MakeCommercetoolsNetTermsTestControl,
  makeCommercetoolsOrderTestControl as MakeCommercetoolsOrderTestControl,
  makeCommercetoolsPaymentTestControl as MakeCommercetoolsPaymentTestControl,
  shippingOptionsTestControlLayer as ShippingOptionsTestControlLayer,
} from "@repo/commerce-provider/testing";
import type { BusinessUnitLookup } from "@repo/commerce/e2e/business-unit-lookup";
import type { CardPaymentEntryDriver } from "@repo/commerce/e2e/card-payment-entry-driver";
import { CheckoutScenario } from "@repo/commerce/e2e/checkout-scenario";
import type { CheckoutScenarioOptions } from "@repo/commerce/e2e/checkout-scenario";
import { ShippingOptionsTestControl } from "@repo/commerce/e2e/shipping-options-test-control";
import {
  e2eApplicationUrlsFromEnvironment,
  test as base,
} from "@repo/e2e-testing";
import type { APIRequestContext, Page } from "@repo/e2e-testing";
import type {
  makeStripeCardPaymentsTestControl as MakeStripeCardPaymentsTestControl,
  StripeCardPaymentEntryDriver as StripeCardPaymentEntryDriverType,
} from "@repo/payments-stripe/testing";
import type { RegistrationTestData } from "@repo/registration/e2e/fixtures";
import {
  provisionScenarioCompany,
  provisionScenarioCompanyMember,
} from "@repo/registration/e2e/provisioning";
import { RegistrationContext } from "@repo/registration/e2e/registration-context";
import type { RegistrationContextOptions } from "@repo/registration/e2e/registration-context";
import { createRegistrationScenario } from "@repo/registration/e2e/registration-scenario";
import type { RegistrationScenario } from "@repo/registration/e2e/registration-scenario";
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
  readonly makeCommercetoolsNetTermsTestControl: typeof MakeCommercetoolsNetTermsTestControl;
  readonly makeCommercetoolsOrderTestControl: typeof MakeCommercetoolsOrderTestControl;
  readonly makeCommercetoolsPaymentTestControl: typeof MakeCommercetoolsPaymentTestControl;
  readonly shippingOptionsTestControlLayer: typeof ShippingOptionsTestControlLayer;
}

interface PaymentsStripeTestingModule {
  readonly makeStripeCardPaymentsTestControl: typeof MakeStripeCardPaymentsTestControl;
  readonly StripeCardPaymentEntryDriver: typeof StripeCardPaymentEntryDriverType;
}

interface E2EServices {
  readonly adminAuth: AuthTestControl["Service"];
  readonly customerAuth: AuthTestControl["Service"];
  readonly deleteCart: CheckoutScenarioOptions["deleteCart"];
  readonly deleteOrder: NonNullable<CheckoutScenarioOptions["deleteOrder"]>;
  readonly deletePayments: NonNullable<
    CheckoutScenarioOptions["deletePayments"]
  >;
  readonly expectShippingOptions: NonNullable<
    CheckoutScenarioOptions["expectShippingOptions"]
  >;
  readonly expectCardNotAuthorized: NonNullable<
    CheckoutScenarioOptions["expectCardNotAuthorized"]
  >;
  readonly expectCardCaptured: NonNullable<
    CheckoutScenarioOptions["expectCardCaptured"]
  >;
  readonly getOrder: NonNullable<CheckoutScenarioOptions["getOrder"]>;
  readonly getPayment: NonNullable<CheckoutScenarioOptions["getPayment"]>;
  readonly getNetTerms: NonNullable<CheckoutScenarioOptions["getNetTerms"]>;
  readonly deleteNetTerms: NonNullable<
    CheckoutScenarioOptions["deleteNetTerms"]
  >;
  readonly setNetTerms: NonNullable<CheckoutScenarioOptions["setNetTerms"]>;
  readonly deleteCommerceAccount: RegistrationContextOptions["deleteCommerceAccount"];
  readonly deleteRegistration: RegistrationContextOptions["deleteRegistration"];
  readonly provisionCompany: RegistrationContextOptions["provisionCompany"];
  readonly provisionCompanyMember: RegistrationContextOptions["provisionCompanyMember"];
  readonly prepareCardCaptureFailure: NonNullable<
    CheckoutScenarioOptions["prepareCardCaptureFailure"]
  >;
  readonly prepareOrderRejection: NonNullable<
    CheckoutScenarioOptions["prepareOrderRejection"]
  >;
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
  readonly businessUnits: BusinessUnitLookup;
  readonly cardPaymentEntry: CardPaymentEntryDriver;
  readonly checkoutScenario: CheckoutScenario;
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
  businessUnits: async ({ registrationScenario }, provide) => {
    await provide({
      idForCompany: (companyName) => {
        const company = registrationScenario.companies.get(companyName);
        if (company === undefined) {
          throw new Error(`The scenario does not have Company ${companyName}`);
        }
        return company.businessUnitId;
      },
    });
  },
  cardPaymentEntry: async ({ page }, provide) => {
    const { StripeCardPaymentEntryDriver } =
      await importLiveModule<PaymentsStripeTestingModule>(
        "@repo/payments-stripe/testing"
      );
    await provide(new StripeCardPaymentEntryDriver(page));
  },
  checkoutScenario: async (
    { e2eServices, page, registration: _registration },
    provide
  ) => {
    const checkoutScenario = new CheckoutScenario({
      deleteCart: e2eServices.deleteCart,
      deleteNetTerms: e2eServices.deleteNetTerms,
      deleteOrder: e2eServices.deleteOrder,
      deletePayments: e2eServices.deletePayments,
      expectCardCaptured: e2eServices.expectCardCaptured,
      expectCardNotAuthorized: e2eServices.expectCardNotAuthorized,
      expectShippingOptions: e2eServices.expectShippingOptions,
      getNetTerms: e2eServices.getNetTerms,
      getOrder: e2eServices.getOrder,
      getPayment: e2eServices.getPayment,
      page,
      prepareCardCaptureFailure: e2eServices.prepareCardCaptureFailure,
      prepareOrderRejection: e2eServices.prepareOrderRejection,
      setNetTerms: e2eServices.setNetTerms,
    });

    try {
      await provide(checkoutScenario);
    } finally {
      await checkoutScenario.dispose();
    }
  },
  e2eServices: [
    async ({ browserName: _browserName }, provide) => {
      const [
        { companyMemberIdentityProjectionLayer },
        { adminAuthTestControlLayer, authTestControlLayer },
        { commerceAccountsLayer },
        { commercetoolsClientsLayer },
        {
          CommercetoolsRestClient,
          makeCommercetoolsJanitorFromApiRoot,
          makeCommercetoolsNetTermsTestControl,
          makeCommercetoolsOrderTestControl,
          makeCommercetoolsPaymentTestControl,
          shippingOptionsTestControlLayer,
        },
        { makeStripeCardPaymentsTestControl },
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
        importLiveModule<PaymentsStripeTestingModule>(
          "@repo/payments-stripe/testing"
        ),
      ]);
      const commerceTestingLayer = shippingOptionsTestControlLayer.pipe(
        Layer.provideMerge(commercetoolsClientsLayer)
      );
      const liveRegistrationLayer = Layer.mergeAll(
        authTestControlLayer,
        commerceAccountsLayer,
        companyMemberIdentityProjectionLayer,
        commerceTestingLayer,
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
              shippingOptions: yield* ShippingOptionsTestControl,
            };
          })
        ),
        adminAuthRuntime.runPromise(AuthTestControl),
      ]);
      const janitor = makeCommercetoolsJanitorFromApiRoot(
        services.restClient.apiRoot
      );
      const netTerms = makeCommercetoolsNetTermsTestControl(
        services.restClient.apiRoot
      );
      const payments = makeCommercetoolsPaymentTestControl(
        services.restClient.apiRoot
      );
      const orders = makeCommercetoolsOrderTestControl(
        services.restClient.apiRoot
      );
      const stripePayments = () => {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (secretKey === undefined || secretKey.length === 0) {
          throw new Error(
            "STRIPE_SECRET_KEY is required to inspect Card Payments"
          );
        }
        return makeStripeCardPaymentsTestControl(secretKey);
      };

      try {
        await provide({
          adminAuth,
          customerAuth: services.auth,
          deleteCart: janitor.deleteCart,
          deleteCommerceAccount: janitor.deleteCommerceAccount,
          deleteNetTerms: netTerms.delete,
          deleteOrder: orders.deleteForCheckout,
          deletePayments: async (cartId) => {
            const resources = await payments.getForCheckout(cartId);
            await Promise.all(
              resources
                .filter(({ provider }) => provider === "Stripe")
                .map(async ({ providerReference }) => {
                  await stripePayments().cancel(providerReference);
                })
            );
            await Promise.all(
              resources.map(async (payment) => {
                await payments.delete(payment);
              })
            );
          },
          deleteRegistration: janitor.deleteRegistration,
          expectCardCaptured: async (
            providerReference,
            expectedMinorAmount
          ) => {
            await stripePayments().expectCaptured(
              providerReference,
              expectedMinorAmount
            );
          },
          expectCardNotAuthorized: async (cartId) => {
            const selected = await payments.getSelectedProvider(cartId);
            if (selected.provider !== "Stripe") {
              throw new Error(
                `Expected Stripe Card Payment, received ${selected.provider}`
              );
            }
            await stripePayments().expectNotAuthorized(
              selected.providerReference
            );
          },
          expectShippingOptions: async (input) => {
            await runtime.runPromise(
              services.shippingOptions.expectShippingOptions(input)
            );
          },
          getNetTerms: netTerms.get,
          getOrder: orders.getForCheckout,
          getPayment: payments.getForCheckoutAssertion,
          prepareCardCaptureFailure: async (cartId) => {
            const payment =
              await payments.getCardCaptureFailurePreparation(cartId);
            const authorization = await stripePayments().authorizeThenCancel(
              payment.providerReference,
              payment.confirmationReference,
              `${payment.attemptReference}:e2e-capture-failure`
            );
            await payments.recordSuccessfulAuthorization(
              payment,
              authorization
            );
          },
          prepareOrderRejection: async (cartId) => {
            await orders.configureOutOfStockRejection(cartId);
          },
          provisionCompany: async (input) =>
            await runtime.runPromise(provisionScenarioCompany(input)),
          provisionCompanyMember: async (input) =>
            await runtime.runPromise(provisionScenarioCompanyMember(input)),
          setNetTerms: netTerms.set,
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
