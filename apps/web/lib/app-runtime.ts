import "server-only";
import { companyMemberInvitationsLayer as authCompanyMemberInvitationsLayer } from "@repo/auth/invitations";
import {
  addressBookLayer,
  cartsLayer,
  commercetoolsClientsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { versionedKeyValueStoreLayer } from "@repo/commerce-provider/versioned-store";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import {
  CompanyInvitationPolicy,
  CompanyMemberInvitationRecords,
  customerAccountMembersLayer,
} from "@repo/registration";
import { Config, Effect, Layer, ManagedRuntime } from "effect";

import { currentAuthLayer } from "./current-auth";
import { nextRequestApiLayer } from "./next-request";
import { nextServerLayer } from "./next-server";

const commerceAccounts = Layer.orDie(commerceAccountsLayer);

export const CommerceApp = makeCommerceApp({
  addressBookLayer: Layer.orDie(addressBookLayer),
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: Layer.orDie(
    cartsLayer.pipe(Layer.provide(commercetoolsClientsLayer))
  ),
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer: commerceAccounts,
  productDiscoveryLayer: Layer.orDie(productDiscoveryLayer),
});

const companyMemberInvitationRecordsLayer = Layer.unwrap(
  Config.string("COMPANY_MEMBER_INVITATION_CONTAINER").pipe(
    Config.orElse(() => Config.succeed("customer-company-member-invitations")),
    Effect.map((container) =>
      CompanyMemberInvitationRecords.layerStorage.pipe(
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
      commerceAccounts
    )
  )
);

export const appLayer = Layer.mergeAll(
  CommerceApp.layer,
  customerAccountMembers,
  currentAuthLayer,
  nextRequestApiLayer,
  nextServerLayer,
  sentryEffectTelemetryLayer
);

export const AppRuntime = ManagedRuntime.make(appLayer);
