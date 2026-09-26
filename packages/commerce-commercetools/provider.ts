import { Layer } from "effect";

import { cartsLayer as carts } from "./cart";
import { commercetoolsClientsLayer } from "./client/layers";

/** The provider owns its transport; applications consume a ready-to-use cart layer. */
export const cartsLayer = carts.pipe(Layer.provide(commercetoolsClientsLayer));

export { addressBookLayer } from "./address-book";
export { paymentRepositoryLayer } from "./payment-repository";
export { ordersLayer } from "./orders";
export { deliveryPlanningLayer } from "./delivery-planning";
export { commercetoolsClientsLayer } from "./client/layers";
export {
  commerceAccountsLayer,
  commerceCompanyMembershipsLayer,
} from "./commerce-accounts";
export { productDiscoveryLayer } from "./product";
