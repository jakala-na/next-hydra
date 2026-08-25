import type { Effect } from "effect";
import { Context, Layer } from "effect";

import type {
  ApiClientId,
  PreparedProject,
  ProductProjectionSearchTimeout,
  ProjectAdministrationError,
  RuntimeClientCreationOutcomeUnknown,
  RuntimeCredentials,
} from "./model";

export interface CreateRuntimeClientInput {
  readonly name: string;
  readonly scope: string;
}

interface CommercetoolsProjectAdministrationValue {
  readonly createRuntimeClient: (
    input: CreateRuntimeClientInput
  ) => Effect.Effect<
    RuntimeCredentials,
    ProjectAdministrationError | RuntimeClientCreationOutcomeUnknown
  >;
  readonly deleteApiClient: (
    clientId: ApiClientId
  ) => Effect.Effect<void, ProjectAdministrationError>;
  readonly prepareProject: Effect.Effect<
    PreparedProject,
    ProjectAdministrationError | ProductProjectionSearchTimeout
  >;
}

export class CommercetoolsProjectAdministration extends Context.Service<
  CommercetoolsProjectAdministration,
  CommercetoolsProjectAdministrationValue
>()("@repo/commerce-commercetools/ProjectAdministration") {
  static readonly layerFrom = (
    value: CommercetoolsProjectAdministrationValue
  ) =>
    Layer.succeed(
      CommercetoolsProjectAdministration,
      CommercetoolsProjectAdministration.of(value)
    );
}
