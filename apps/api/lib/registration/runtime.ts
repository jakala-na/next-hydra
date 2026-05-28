import { identityUsersLayerWorkos } from "@repo/auth-workos/identity-users";
import { invitationsLayerWorkos } from "@repo/auth-workos/invitations";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { layerCommercetoolsCustomObjectKeyValueStore } from "@repo/commerce/lib/infra/commercetools/key-value-store";
import { layerResendEmailProvider } from "@repo/email/resend-provider";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { layerRegistrationEmails } from "@repo/registration";
import { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import { Registrations } from "@repo/registration/services/registrations";
import { VatValidator } from "@repo/registration/services/vat-validator";
import { Layer } from "effect";
import { env } from "@/env";
import { layerCommercetoolsRegistrationQueries } from "./providers/commercetools-registration-queries";

export const REGISTRATION_CONTAINER =
  process.env.REGISTRATION_CONTAINER ?? "b2b-registration-by-id";

const registrationStorageLayer = layerCommercetoolsCustomObjectKeyValueStore({
  container: REGISTRATION_CONTAINER,
});

const registrationEmailsLayer = layerRegistrationEmails({
  approverEmail: env.REGISTRATION_APPROVER_EMAIL,
  webUrl: env.NEXT_PUBLIC_WEB_URL,
}).pipe(Layer.provide(layerResendEmailProvider));

export const registrationLayer = Registrations.layerStorage.pipe(
  Layer.provide(registrationStorageLayer),
  Layer.provideMerge(
    layerCommercetoolsRegistrationQueries({
      container: REGISTRATION_CONTAINER,
    })
  ),
  Layer.provideMerge(layerCommercetoolsCommerceAccounts),
  Layer.provideMerge(identityUsersLayerWorkos),
  Layer.provideMerge(invitationsLayerWorkos),
  Layer.provideMerge(RegistrationMarketPolicy.layerDefault),
  Layer.provideMerge(
    VatValidator.layerMemoryFrom({
      invalidVatIds: ["INVALID-VAT", "VAT-INVALID", "000"],
    })
  ),
  Layer.provideMerge(registrationEmailsLayer),
  Layer.provideMerge(sentryEffectTelemetryLayer)
);
