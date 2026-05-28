import { Effect, Layer } from "effect";
import { Resend } from "resend";
import { keys } from "./keys";
import { EmailProvider, EmailProviderFailure } from "./provider";

const getErrorCause = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause));

export const layerResendEmailProvider = Layer.sync(EmailProvider, () => {
  const emailKeys = keys();
  const resend = new Resend(emailKeys.RESEND_TOKEN);

  return EmailProvider.of({
    send: (message) =>
      Effect.tryPromise({
        try: async () => {
          const result = await resend.emails.send({
            from: emailKeys.RESEND_FROM,
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
            message: `Failed to send email: ${getErrorCause(cause).message}`,
            operation: "send",
            cause: getErrorCause(cause),
          }),
      }),
  });
});
