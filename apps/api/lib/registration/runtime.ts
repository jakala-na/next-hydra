import { identityUsersLayerWorkos } from "@repo/auth/identity-users";
import { invitationsLayerWorkos } from "@repo/auth/invitations";
import { commerceAccountsLayer } from "@repo/commerce-provider/commerce-accounts";
import { registrationQueriesLayer } from "@repo/commerce-provider/registration";
import { versionedKeyValueStoreLayer } from "@repo/commerce-provider/versioned-store";
import { layerResendEmailProvider } from "@repo/email/resend-provider";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { layerRegistrationEmails } from "@repo/registration";
import { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import { Registrations } from "@repo/registration/services/registrations";
import { VatValidator } from "@repo/registration/services/vat-validator";
import { Layer } from "effect";
import { env } from "@/env";

export const REGISTRATION_CONTAINER =
  process.env.REGISTRATION_CONTAINER ?? "b2b-registration-by-id";

const registrationStorageLayer = versionedKeyValueStoreLayer({
  container: REGISTRATION_CONTAINER,
});

const registrationEmailsLayer = layerRegistrationEmails({
  approverEmail: env.REGISTRATION_APPROVER_EMAIL,
  webUrl: env.NEXT_PUBLIC_WEB_URL,
}).pipe(Layer.provide(layerResendEmailProvider));

export const registrationLayer = Registrations.layerStorage.pipe(
  Layer.provide(registrationStorageLayer),
  Layer.provideMerge(
    registrationQueriesLayer({
      container: REGISTRATION_CONTAINER,
    })
  ),
  Layer.provideMerge(commerceAccountsLayer),
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
