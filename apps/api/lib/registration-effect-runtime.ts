import { identityUsersLayerWorkos } from "@repo/auth-workos/identity-users";
import { invitationsLayerWorkos } from "@repo/auth-workos/invitations";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { layerCommercetoolsCustomObjectKeyValueStore } from "@repo/commerce/lib/infra/commercetools/key-value-store";
import { layerCommercetoolsRegistrationQueries } from "@repo/commerce/lib/infra/commercetools/registration-queries";
import { layerRegistrationEmails } from "@repo/email/registration-effect";
import { layerResendEmailProvider } from "@repo/email/resend-provider";
import { RegistrationMarketPolicy } from "@repo/registration-effect/services/registration-market-policy";
import { Registrations } from "@repo/registration-effect/services/registrations";
import { VatValidator } from "@repo/registration-effect/services/vat-validator";
import { Layer } from "effect";
import { env } from "@/env";

export const REGISTRATION_EFFECT_CONTAINER =
  process.env.REGISTRATION_EFFECT_CONTAINER ?? "b2b-registration-effect-by-id";

const registrationStorageLayer = layerCommercetoolsCustomObjectKeyValueStore({
  container: REGISTRATION_EFFECT_CONTAINER,
});

const registrationEmailsLayer = layerRegistrationEmails({
  approverEmail: env.REGISTRATION_APPROVER_EMAIL,
  webUrl: env.NEXT_PUBLIC_WEB_URL,
}).pipe(Layer.provide(layerResendEmailProvider));

export const registrationEffectLayer = Registrations.layerStorage.pipe(
  Layer.provide(registrationStorageLayer),
  Layer.provideMerge(
    layerCommercetoolsRegistrationQueries({
      container: REGISTRATION_EFFECT_CONTAINER,
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
  Layer.provideMerge(registrationEmailsLayer)
);
