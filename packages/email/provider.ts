import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { ReactNode } from "react";

export class EmailProviderFailure extends Schema.TaggedErrorClass<EmailProviderFailure>()(
  "EmailProviderFailure",
  {
    cause: Schema.Defect,
    message: Schema.String,
    operation: Schema.Literal("send"),
  }
) {}

export interface EmailMessage {
  readonly to: string | string[];
  readonly subject: string;
  readonly react: ReactNode;
  readonly replyTo?: string | string[];
}

export interface EmailDelivery {
  readonly providerMessageId: string | null;
}

export class EmailProvider extends Context.Service<
  EmailProvider,
  {
    readonly send: (
      message: EmailMessage
    ) => Effect.Effect<EmailDelivery, EmailProviderFailure>;
  }
>()("@repo/email/EmailProvider") {
  static readonly layerMemory = Layer.effect(
    EmailProvider,
    Effect.gen(function* () {
      const outbox = yield* Ref.make<readonly EmailMessage[]>([]);

      return EmailProvider.of({
        send: (message) =>
          Ref.update(outbox, (messages) => [...messages, message]).pipe(
            Effect.as({ providerMessageId: null })
          ),
      });
    })
  );
}
