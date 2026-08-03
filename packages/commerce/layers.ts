import "server-only";

import { Effect, Layer } from "effect";
import { ProductDiscovery } from "./product/product-discovery";
import { AddressBook } from "./services/address-book";
import { Carts } from "./services/carts";
import { CommerceAccounts } from "./services/commerce-accounts";
import type {
  CommerceIdentity,
  CommerceRequestFailure,
} from "./services/commerce-identity";

export class CommerceLayersNotConfigured extends Error {
  override readonly name = "CommerceLayersNotConfigured";
  readonly binding: string;

  constructor(binding: string) {
    super(`Commerce binding is not configured: ${binding}`);
    this.binding = binding;
  }
}

const notConfigured = (binding: string) =>
  new CommerceLayersNotConfigured(binding);

export const commerceIdentityLayer = (): Promise<
  Layer.Layer<CommerceIdentity, CommerceRequestFailure>
> => Promise.reject(notConfigured("commerceIdentityLayer"));

export const addressBookLayer = Layer.effect(
  AddressBook,
  Effect.die(notConfigured("addressBookLayer"))
);

export const cartsLayer = Layer.effect(
  Carts,
  Effect.die(notConfigured("cartsLayer"))
);

export const commerceAccountsLayer = Layer.effect(
  CommerceAccounts,
  Effect.die(notConfigured("commerceAccountsLayer"))
);

export const productDiscoveryLayer = Layer.effect(
  ProductDiscovery,
  Effect.die(notConfigured("productDiscoveryLayer"))
);
