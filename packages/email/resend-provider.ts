import {
  EmailProvider,
  EmailProviderFailure,
} from "@repo/registration-effect/services/email-provider";
import { Effect, Layer } from "effect";
import { resend } from ".";
import { keys } from "./keys";

const getErrorCause = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause));

export const layerResendEmailProvider = Layer.succeed(
  EmailProvider,
  EmailProvider.of({
    send: (message) =>
      Effect.tryPromise({
        try: async () => {
          const result = await resend.emails.send({
            from: keys().RESEND_FROM,
            to: message.to,
            subject: message.subject,
            react: message.react,
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          });

          if (result.error) {
            throw result.error;
          }

          return { providerMessageId: result.data.id };
        },
        catch: (cause: unknown) =>
          new EmailProviderFailure({
            operation: "send",
            cause: getErrorCause(cause),
          }),
      }),
  })
);
