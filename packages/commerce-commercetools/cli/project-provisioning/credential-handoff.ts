import type {
  PrivateDotEnvFileError,
  PrivateDotEnvFileReceipt,
} from "@repo/cli-core/private-dotenv";
import type { Effect } from "effect";
import { Context, Layer } from "effect";

import type { RuntimeCredentials } from "./model";

interface RuntimeCredentialHandoffValue {
  readonly save: (
    credentials: RuntimeCredentials,
    destination: string
  ) => Effect.Effect<PrivateDotEnvFileReceipt, PrivateDotEnvFileError>;
}

export class RuntimeCredentialHandoff extends Context.Service<
  RuntimeCredentialHandoff,
  RuntimeCredentialHandoffValue
>()("@repo/commerce-commercetools/RuntimeCredentialHandoff") {
  static readonly layerFrom = (value: RuntimeCredentialHandoffValue) =>
    Layer.succeed(RuntimeCredentialHandoff, RuntimeCredentialHandoff.of(value));
}
