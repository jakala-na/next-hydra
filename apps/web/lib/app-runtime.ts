import "server-only";
import { identityUsersLayer } from "@repo/auth/identity-users";
import {
  companyMemberIdentityProjectionLayer,
  companyMemberInvitationsLayer as authCompanyMemberInvitationsLayer,
} from "@repo/auth/invitations";
import {
  addressBookLayer,
  cartsLayer,
  commercetoolsClientsLayer,
  commerceAccountsLayer,
  commerceCompanyMembershipsLayer,
  deliveryPlanningLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import {
  DEFAULT_COMPANY_MEMBER_INVITATION_CONTAINER,
  versionedKeyValueStoreLayer,
} from "@repo/commerce-provider/versioned-store";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { commercetoolsStripeCheckoutPaymentsLayer } from "@repo/payments-stripe/server/commercetools";
import {
  CompanyInvitationPolicy,
  CompanyMemberInvitationRecords,
  companyMemberRemovalRecordsLayerStorage,
  customerAccountMembersLayer,
} from "@repo/registration";
import { Config, Effect, Layer, ManagedRuntime } from "effect";

import { currentAuthLayer } from "./current-auth";
import { nextRequestApiLayer } from "./next-request";
import { nextServerLayer } from "./next-server";

const commerceAccounts = Layer.orDie(commerceAccountsLayer);

const checkoutPaymentsLayer = Layer.orDie(
  commercetoolsStripeCheckoutPaymentsLayer
);

export const CommerceApp = makeCommerceApp({
  addressBookLayer: Layer.orDie(addressBookLayer),
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: Layer.orDie(
    cartsLayer.pipe(Layer.provide(commercetoolsClientsLayer))
  ),
  checkoutPaymentsLayer,
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer: commerceAccounts,
  commerceCompanyMembershipsLayer: Layer.orDie(commerceCompanyMembershipsLayer),
  deliveryPlanningLayer: Layer.orDie(
    deliveryPlanningLayer.pipe(Layer.provide(commercetoolsClientsLayer))
  ),
  productDiscoveryLayer: Layer.orDie(productDiscoveryLayer),
});

const companyMemberInvitationRecordsLayer = Layer.unwrap(
  Config.string("COMPANY_MEMBER_INVITATION_CONTAINER").pipe(
    Config.orElse(() =>
      Config.succeed(DEFAULT_COMPANY_MEMBER_INVITATION_CONTAINER)
    ),
    Effect.map((container) =>
      CompanyMemberInvitationRecords.layerStorage.pipe(
        Layer.provide(versionedKeyValueStoreLayer({ container }))
      )
    )
  )
);

const companyMemberRemovalRecordsLayer = Layer.unwrap(
  Config.string("COMPANY_MEMBER_REMOVAL_CONTAINER").pipe(
    Config.orElse(() => Config.succeed("customer-company-member-removals")),
    Effect.map((container) =>
      companyMemberRemovalRecordsLayerStorage.pipe(
        Layer.provide(versionedKeyValueStoreLayer({ container }))
      )
    )
  )
);

const customerAccountMembers = customerAccountMembersLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.orDie(authCompanyMemberInvitationsLayer),
      CompanyInvitationPolicy.layer,
      Layer.orDie(companyMemberInvitationRecordsLayer),
      commerceAccounts,
      Layer.orDie(companyMemberIdentityProjectionLayer),
      Layer.orDie(identityUsersLayer)
    )
  )
);

export const appLayer = Layer.mergeAll(
  CommerceApp.layer,
  Layer.orDie(companyMemberRemovalRecordsLayer),
  customerAccountMembers,
  currentAuthLayer,
  nextRequestApiLayer,
  nextServerLayer,
  sentryEffectTelemetryLayer
);

export const AppRuntime = ManagedRuntime.make(appLayer);
