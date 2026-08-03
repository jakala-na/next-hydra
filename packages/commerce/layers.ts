import "server-only";

import { Effect, Layer } from "effect";
import { ProductDiscovery } from "./product/product-discovery";
import { CommerceAccounts } from "./services/commerce-accounts";

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

export const readAuthUserId = (): Promise<string | undefined> =>
  Promise.reject(notConfigured("readAuthUserId"));

export const commerceAccountsLayer = Layer.effect(
  CommerceAccounts,
  Effect.die(notConfigured("commerceAccountsLayer"))
);

export const productDiscoveryLayer = Layer.effect(
  ProductDiscovery,
  Effect.die(notConfigured("productDiscoveryLayer"))
);
