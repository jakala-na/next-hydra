import type { Locale } from "@repo/i18n/types";
import type { Store } from "../types";
import { storeRepo } from "./store.repo";
import type { StoreContext, StoreService } from "./types";
import {
  getDefaultCurrencyByLocale,
  getStoreKeyByLocale,
} from "./utils/mappings";

function getStoreByKey(key: string, locale: Locale): Promise<Store> {
  return storeRepo.getStoreByKey(key, locale);
}

function getStoreByLocale(locale: Locale): Promise<Store> {
  const key = getStoreKeyByLocale(locale);
  return storeRepo.getStoreByKey(key, locale);
}

async function getStoreContextByLocale(locale: Locale): Promise<StoreContext> {
  const currency = getDefaultCurrencyByLocale(locale);
  const store = await getStoreByLocale(locale);

  const distributionChannel = store.distributionChannels?.[0] ?? null;
  const supplyChannelIds = (store.supplyChannels ?? []).map((c) => c.id);

  return {
    locale,
    currency,
    storeId: store.id,
    storeKey: store.key,
    distributionChannelKey: distributionChannel?.key ?? "",
    distributionChannelId: distributionChannel?.id ?? "",
    supplyChannelIds,
  };
}

export const storeService: StoreService = {
  getStoreByKey,
  getStoreByLocale,
  getStoreContextByLocale,
};
