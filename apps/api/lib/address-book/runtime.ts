import { apiAuthenticationLayer } from "../auth/runtime";
import { commerceApp } from "../commerce/runtime";
import { makeAddressBookHttpHandler } from "./http";

const addressBookHttp = makeAddressBookHttpHandler({
  authenticationLayer: apiAuthenticationLayer,
  commerceApp,
});

export const addressBookHttpHandler = addressBookHttp.handler;
