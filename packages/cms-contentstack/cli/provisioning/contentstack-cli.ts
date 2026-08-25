import { Context, Layer } from "effect";
import type { Effect } from "effect";

import type {
  ContentstackCliError,
  ContentstackRuntimeEndpoints,
  ContentstackStack,
} from "./model";

export interface ImportContentstackRecipeOptions {
  readonly directory: string;
  readonly managementTokenAlias: string;
}

export interface RunContentstackMigrationOptions {
  readonly file: string;
  readonly managementTokenAlias: string;
}

interface ContentstackCliValue {
  readonly importRecipe: (
    options: ImportContentstackRecipeOptions
  ) => Effect.Effect<void, ContentstackCliError>;
  readonly resolveStack: (
    managementTokenAlias: string
  ) => Effect.Effect<ContentstackStack, ContentstackCliError>;
  readonly runMigration: (
    options: RunContentstackMigrationOptions
  ) => Effect.Effect<void, ContentstackCliError>;
  readonly runtimeEndpoints: () => Effect.Effect<
    ContentstackRuntimeEndpoints,
    ContentstackCliError
  >;
  readonly version: () => Effect.Effect<string, ContentstackCliError>;
}

export class ContentstackCli extends Context.Service<
  ContentstackCli,
  ContentstackCliValue
>()("@repo/cms-contentstack/ContentstackCli") {
  static readonly layerFrom = (value: ContentstackCliValue) =>
    Layer.succeed(ContentstackCli, ContentstackCli.of(value));
}
