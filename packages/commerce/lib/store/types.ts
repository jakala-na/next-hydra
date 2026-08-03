import type { Locale } from "@repo/i18n/types";
import type { CurrencyCode } from "../../domain/money";
import type { Store } from "../types";

export interface StoreRepository {
  getStoreByKey(key: string, locale: Locale): Promise<Store>;
}

export interface StoreService {
  getStoreByKey(key: string, locale: Locale): Promise<Store>;
  getStoreByLocale(locale: Locale): Promise<Store>;
  getStoreContextByLocale(locale: Locale): Promise<StoreContext>;
}

export type StoreContext = {
  locale: Locale;
  currency: CurrencyCode;
  storeId: string;
  storeKey: string;
  distributionChannelKey: string;
  distributionChannelId: string;
  supplyChannelIds: string[];
};
