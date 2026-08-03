import "server-only";

import {
  commerceAccountsLayer,
  productDiscoveryLayer,
  readAuthUserId,
} from "@repo/commerce/layers";
import type { Locale } from "@repo/i18n/types";
import { Layer, Schema } from "effect";
import { cookies } from "next/headers";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  getBusinessUnitIdFromCookieValue,
} from "../commerce-context/business-unit-cookie";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
} from "../domain/commerce-request-context";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, resolveStore } from "../store";

const commerceContextRequest = async (locale: Locale) => {
  const [rawAuthUserId, cookieStore] = await Promise.all([
    readAuthUserId(),
    cookies(),
  ]);
  const store = resolveStore({ locale: CommerceLocale.make(locale) });

  if (rawAuthUserId === undefined) {
    return new AnonymousCommerceContextRequest({ store });
  }

  const authUserId = Schema.decodeUnknownSync(AuthUserId)(rawAuthUserId);
  const businessUnitId = getBusinessUnitIdFromCookieValue(
    cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value
  );
  return new CustomerCommerceContextRequest({
    store,
    authUserId,
    ...(businessUnitId === undefined ? {} : { businessUnitId }),
  });
};

export const productDiscoveryRequestLayer = async (locale: Locale) => {
  const request = await commerceContextRequest(locale);
  const commerceContextLayer = CommerceContext.layer(request).pipe(
    Layer.provide(commerceAccountsLayer)
  );
  return productDiscoveryLayer.pipe(Layer.provide(commerceContextLayer));
};
