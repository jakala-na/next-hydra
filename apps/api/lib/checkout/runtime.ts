import { apiAuthenticationLayer } from "../auth/runtime";
import { commerceApp } from "../commerce/runtime";
import { makeCheckoutHttpHandler } from "./http";

const checkoutHttpDependencies = {
  authenticationLayer: apiAuthenticationLayer,
  commerceApp,
};

const checkoutHttp = makeCheckoutHttpHandler(checkoutHttpDependencies);

export const checkoutHttpHandler = checkoutHttp.handler;
