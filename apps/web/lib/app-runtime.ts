import "server-only";
import { companyMemberInvitationsLayer as authCompanyMemberInvitationsLayer } from "@repo/auth/invitations";
import {
  addressBookLayer,
  cartsLayer,
  commercetoolsClientsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import {
  CompanyInvitationPolicy,
  customerAccountMembersLayer,
} from "@repo/registration";
import { Layer, ManagedRuntime } from "effect";

import { currentAuthLayer } from "./current-auth";
import { nextRequestApiLayer } from "./next-request";
import { nextServerLayer } from "./next-server";

export const CommerceApp = makeCommerceApp({
  addressBookLayer: Layer.orDie(addressBookLayer),
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: Layer.orDie(
    cartsLayer.pipe(Layer.provide(commercetoolsClientsLayer))
  ),
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer: Layer.orDie(commerceAccountsLayer),
  productDiscoveryLayer: Layer.orDie(productDiscoveryLayer),
});

const customerAccountMembers = customerAccountMembersLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.orDie(authCompanyMemberInvitationsLayer),
      CompanyInvitationPolicy.layer
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
