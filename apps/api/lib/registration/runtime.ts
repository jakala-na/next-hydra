import { identityUsersLayer } from "@repo/auth/identity-users";
import { invitationsLayer } from "@repo/auth/invitations";
import { commerceAccountsLayer } from "@repo/commerce-provider/commerce-accounts";
import { registrationQueriesLayer } from "@repo/commerce-provider/registration";
import { layerResendEmailProvider } from "@repo/email/resend-provider";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { layerRegistrationEmails } from "@repo/registration";
import { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import { VatValidator } from "@repo/registration/services/vat-validator";
import { Layer } from "effect";

import { env } from "@/env";

import {
  REGISTRATION_CONTAINER,
  registrationRepositoryLayer,
} from "./repository-runtime";

export { REGISTRATION_CONTAINER } from "./repository-runtime";

const registrationEmailsLayer = layerRegistrationEmails({
  adminUrl: env.ADMIN_URL,
  approverEmail: env.REGISTRATION_APPROVER_EMAIL,
  webUrl: env.NEXT_PUBLIC_WEB_URL,
}).pipe(Layer.provide(layerResendEmailProvider));

const registrationInvitationsLayer = invitationsLayer.pipe(
  Layer.provide(registrationRepositoryLayer)
);

export const registrationLayer = registrationRepositoryLayer.pipe(
  Layer.provideMerge(
    registrationQueriesLayer({
      container: REGISTRATION_CONTAINER,
    })
  ),
  Layer.provideMerge(commerceAccountsLayer),
  Layer.provideMerge(identityUsersLayer),
  Layer.provideMerge(registrationInvitationsLayer),
  Layer.provideMerge(RegistrationMarketPolicy.layerDefault),
  Layer.provideMerge(
    VatValidator.layerMemoryFrom({
      invalidVatIds: ["INVALID-VAT", "VAT-INVALID", "000"],
    })
  ),
  Layer.provideMerge(registrationEmailsLayer),
  Layer.provideMerge(sentryEffectTelemetryLayer)
);
