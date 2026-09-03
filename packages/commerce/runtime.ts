import "server-only";
import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import { NextServer } from "@repo/actions/next-server";
import type { Locale } from "@repo/i18n/types";
import { CheckoutPayments } from "@repo/payments";
import { Effect, Layer, ManagedRuntime } from "effect";

import { CheckoutPolicies } from "./lib/checkout/checkout-policy";
import type {
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceRequestLayerServices,
  CommerceRequestServices,
  CommerceStableServices,
} from "./runtime/make-commerce-app";
import { CartPolicies } from "./services/cart-policies";
import { Carts } from "./services/carts";
import { CommerceAccounts } from "./services/commerce-accounts";
import { CommerceCompanyMemberships } from "./services/commerce-company-memberships";
import { CompanyMemberRemovalRecords } from "./services/company-member-removal-records";
import { CustomerAccountMembers } from "./services/customer-account-members";
import { DeliveryPlanning } from "./services/delivery-planning";
import { Orders } from "./services/orders";
import type { StoreKey } from "./store";

export type {
  AddressBookRequestServices,
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceRequestLayerServices,
  CommerceRequestServices,
  CommerceStableServices,
} from "./runtime/make-commerce-app";

export interface CommerceRequestOptions {
  readonly selectedStoreKey?: StoreKey;
}

export type NextCommerceRequestError = CommerceRequestProvisionError;

export type CommerceActionClient<
  ActionServices,
  RuntimeServices,
  Context extends object,
> = ActionClient<
  RuntimeServices | ActionServices,
  NextCommerceRequestError,
  RuntimeServices,
  Context,
  "Provided"
>;

export interface NextCommerceRuntime {
  readonly provide: (
    locale: Locale,
    options?: CommerceRequestOptions
  ) => <A, E>(
    program: Effect.Effect<
      A,
      E,
      | CommerceRequestServices
      | CommerceStableServices
      | CompanyMemberRemovalRecords
      | CustomerAccountMembers
    >
  ) => Effect.Effect<
    A,
    E | NextCommerceRequestError,
    | CommerceStableServices
    | CompanyMemberRemovalRecords
    | CustomerAccountMembers
    | NextServer
  >;
  readonly runPromise: <A, E>(
    program: Effect.Effect<
      A,
      E,
      | CommerceStableServices
      | CompanyMemberRemovalRecords
      | CustomerAccountMembers
      | NextServer
    >
  ) => Promise<A>;
}

// oxlint-disable-next-line unicorn/custom-error-definition -- Preserve the established public binding name.
export class CommerceRuntimeNotConfigured extends Error {
  override readonly name = "CommerceRuntimeNotConfigured";

  constructor() {
    super("The Commerce application runtime is not configured");
  }
}

export const CommerceApp: CommerceApplication<
  never,
  CommerceRequestProvisionError
> = {
  layer: Layer.effectContext(Effect.die(new CommerceRuntimeNotConfigured())),
  provide: () => () => Effect.die(new CommerceRuntimeNotConfigured()),
  provideAddressBook: () => () =>
    Effect.die(new CommerceRuntimeNotConfigured()),
  requestLayer: () =>
    Layer.effectContext(Effect.die(new CommerceRuntimeNotConfigured())),
};

export const NextCommerce: NextCommerceRuntime = {
  provide: () => () => Effect.die(new CommerceRuntimeNotConfigured()),
  runPromise: async () =>
    await Promise.reject(new CommerceRuntimeNotConfigured()),
};

interface CommerceActionContext {
  readonly locale: Locale;
}

const unconfiguredRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    Layer.effect(CartPolicies, Effect.die(new CommerceRuntimeNotConfigured())),
    Layer.effect(Carts, Effect.die(new CommerceRuntimeNotConfigured())),
    Layer.effect(
      CheckoutPayments,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(
      CheckoutPolicies,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(
      CommerceAccounts,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(
      CommerceCompanyMemberships,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(
      DeliveryPlanning,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(Orders, Effect.die(new CommerceRuntimeNotConfigured())),
    Layer.effect(
      CompanyMemberRemovalRecords,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(
      CustomerAccountMembers,
      Effect.die(new CommerceRuntimeNotConfigured())
    ),
    Layer.effect(NextServer, Effect.die(new CommerceRuntimeNotConfigured()))
  )
);

const unconfiguredActionContext = ActionMiddleware.context<
  EmptyActionContext,
  CommerceActionContext
>(() => Effect.succeed({ locale: "en-US" }));

const unconfiguredRequestLayer = (): Layer.Layer<
  CommerceRequestLayerServices,
  CommerceRequestProvisionError,
  CommerceStableServices
> => Layer.effectContext(Effect.die(new CommerceRuntimeNotConfigured()));

/** The application replaces this binding through its exact runtime alias. */
export const CommerceActions = ActionClient.make(unconfiguredRuntime)
  .use(unconfiguredActionContext)
  .provide(unconfiguredRequestLayer);
