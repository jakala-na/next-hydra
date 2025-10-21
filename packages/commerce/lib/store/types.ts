import type { CurrencyCode, Locale } from "@repo/i18n/types";
import type { Store } from "../types";

export interface StoreRepository {
  // Return variantIds that are sellable in this store
  getProductSelectionsForProducts(
    storeKey: string,
    productIds: string[]
  ): Promise<Map<string, ProductSelectionRule[]>>;
  getStoreByKey(key: string, locale: Locale): Promise<Store>;
}

export interface StoreService {
  getStoreByKey(key: string, locale: Locale): Promise<Store>;
  getStoreByLocale(locale: Locale): Promise<Store>;
  getStoreContextByLocale(locale: Locale): Promise<StoreContext>;
}

// Group assignments by productId
export type ProductSelectionRule = {
  mode: "Individual" | "IndividualExclusion";
  variantSelection: {
    type: "includeOnly" | "includeAllExcept";
    skus: string[];
  } | null;
  variantExclusion: { skus: string[] } | null;
};

export type StoreContext = {
  locale: Locale;
  currency: CurrencyCode;
  storeId: string;
  storeKey: string;
  distributionChannelKey: string;
  distributionChannelId: string;
  supplyChannelIds: string[];
};
