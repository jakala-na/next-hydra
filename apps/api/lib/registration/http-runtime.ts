import { Layer } from "effect";

import { apiAuthenticationLayer } from "../auth/runtime";
import { makeRegistrationHttpHandler } from "./http";
import { registrationLayer } from "./runtime";
import { registrationWorkflowLayer } from "./workflow-runtime";

const registrationHttp = makeRegistrationHttpHandler({
  authenticationLayer: apiAuthenticationLayer,
  layer: registrationLayer.pipe(Layer.provideMerge(registrationWorkflowLayer)),
});

export const registrationHttpHandler = registrationHttp.handler;
