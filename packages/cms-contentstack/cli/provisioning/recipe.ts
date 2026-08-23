import { Context, Layer } from "effect";
import type { Effect, Scope } from "effect";

import type {
  ContentstackRecipeError,
  ContentstackRecipeReceipt,
} from "./model";

export interface MaterializeContentstackRecipeOptions {
  readonly localUrl: string;
  readonly productionUrl: string;
  readonly targetMasterLocale: string;
}

interface ContentstackRecipeValue {
  readonly materialize: (
    options: MaterializeContentstackRecipeOptions
  ) => Effect.Effect<
    ContentstackRecipeReceipt,
    ContentstackRecipeError,
    Scope.Scope
  >;
}

export class ContentstackRecipe extends Context.Service<
  ContentstackRecipe,
  ContentstackRecipeValue
>()("@repo/cms-contentstack/ContentstackRecipe") {
  static readonly layerFrom = (value: ContentstackRecipeValue) =>
    Layer.succeed(ContentstackRecipe, ContentstackRecipe.of(value));
}
