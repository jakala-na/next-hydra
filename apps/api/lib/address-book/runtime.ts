import {
  addressBookLayer,
  commerceAccountsLayer,
} from "@repo/commerce-provider/provider";

import { apiAuthenticationLayer } from "../auth/runtime";
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- This application composition root owns the HTTP handler's Layer lifecycle.
import { makeAddressBookHttpHandler } from "./http";

const addressBookHttp = makeAddressBookHttpHandler({
  addressBookLayer,
  authenticationLayer: apiAuthenticationLayer,
  commerceAccountsLayer,
});

export const addressBookHttpHandler = addressBookHttp.handler;
