import { authCapabilities } from "@repo/auth/capabilities";
import { Layer } from "effect";

import {
  adminAuthenticationLayer,
  adminIdentityUsersLayer,
} from "../auth/admin-runtime";
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- This application composition root owns provider-gated HTTP handler construction.
import { makeRegistrationHttpHandler } from "./http";
import { registrationLayer } from "./runtime";
import { registrationWorkflowLayer } from "./workflow-runtime";

const registrationHttp = authCapabilities.registrationOnboarding
  ? makeRegistrationHttpHandler({
      authenticationLayer: adminAuthenticationLayer,
      layer: registrationLayer.pipe(
        Layer.provideMerge(registrationWorkflowLayer)
      ),
      reviewerIdentityLayer: adminIdentityUsersLayer,
    })
  : undefined;

export const registrationHttpHandler =
  registrationHttp?.handler ??
  (() =>
    Response.json(
      {
        code: "registration_onboarding_not_supported",
        message:
          "Registration onboarding is not supported by the selected authentication provider.",
      },
      { status: 501 }
    ));
