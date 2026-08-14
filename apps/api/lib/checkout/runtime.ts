import { commerceApp, commerceAuthenticationLayer } from "../commerce/runtime";
import { makeCheckoutHttpHandler } from "./http";

const checkoutHttpDependencies = {
  authenticationLayer: commerceAuthenticationLayer,
  commerceApp,
};

const checkoutHttp = makeCheckoutHttpHandler(checkoutHttpDependencies);

export const checkoutHttpHandler = checkoutHttp.handler;
