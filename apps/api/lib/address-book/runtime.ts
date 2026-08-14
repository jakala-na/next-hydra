import { commerceApp, commerceAuthenticationLayer } from "../commerce/runtime";
import { makeAddressBookHttpHandler } from "./http";

const addressBookHttp = makeAddressBookHttpHandler({
  authenticationLayer: commerceAuthenticationLayer,
  commerceApp,
});

export const addressBookHttpHandler = addressBookHttp.handler;
