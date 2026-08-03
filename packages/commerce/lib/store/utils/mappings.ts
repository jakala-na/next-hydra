import type { Locale } from "@repo/i18n/types";
import type { CurrencyCode } from "../../../domain/money";
import { CommerceLocale, resolveStore, type StoreKey } from "../../../store";

const resolveStoreByLocale = (locale: Locale) =>
  resolveStore({ locale: CommerceLocale.make(locale) });

export const getStoreKeyByLocale = (locale: Locale): StoreKey =>
  resolveStoreByLocale(locale).storeKey;

export const getDefaultCurrencyByLocale = (locale: Locale): CurrencyCode =>
  resolveStoreByLocale(locale).currency;
