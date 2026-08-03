import { Context, Effect, Layer, Schema } from "effect";
import { AuthUserId } from "../domain/commerce-request-context";

export class CommerceRequestFailure extends Schema.TaggedErrorClass<CommerceRequestFailure>()(
  "CommerceRequestFailure",
  {
    operation: Schema.Literal("decodeAuthUserId"),
    cause: Schema.Defect,
  }
) {}

export class CommerceIdentity extends Context.Service<
  CommerceIdentity,
  {
    readonly authUserId: AuthUserId | undefined;
  }
>()("@repo/commerce/CommerceIdentity") {
  static readonly layer = (rawAuthUserId: string | undefined) =>
    Layer.effect(
      CommerceIdentity,
      rawAuthUserId === undefined
        ? Effect.succeed(CommerceIdentity.of({ authUserId: undefined }))
        : Schema.decodeUnknownEffect(AuthUserId)(rawAuthUserId).pipe(
            Effect.map((authUserId) => CommerceIdentity.of({ authUserId })),
            Effect.mapError(
              (cause) =>
                new CommerceRequestFailure({
                  operation: "decodeAuthUserId",
                  cause,
                })
            )
          )
    );
}
