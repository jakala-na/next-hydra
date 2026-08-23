import { Effect, FileSystem, Layer, Path } from "effect";

import {
  CONTENTSTACK_ENVIRONMENTS,
  ContentstackRecipeError,
  ContentstackRecipeReceipt,
} from "./model";
import { ContentstackRecipe } from "./recipe";

export const CONTENTSTACK_RECIPE_VERSION = "2";

const LOCAL_URL_PLACEHOLDER = "__NEXT_HYDRA_LOCAL_URL__";
const PRODUCTION_URL_PLACEHOLDER = "__NEXT_HYDRA_PRODUCTION_URL__";

const recipeError = (
  operation: ContentstackRecipeError["operation"],
  message: string,
  cause: unknown
) => new ContentstackRecipeError({ cause, message, operation });

const normalizeHttpUrl = (name: string, input: string) =>
  Effect.try({
    catch: (cause) =>
      recipeError(
        "validateUrl",
        `${name} must be an absolute http or https URL`,
        cause
      ),
    try: () => {
      const url = new URL(input);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`Unsupported URL protocol ${url.protocol}`);
      }
      return url.toString().replace(/\/$/u, "");
    },
  });

export const contentstackRecipeLayer = Layer.effect(
  ContentstackRecipe,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceDirectory = yield* path
      .fromFileUrl(new URL("../../recipe/", import.meta.url))
      .pipe(
        Effect.mapError((cause) =>
          recipeError(
            "locate",
            "Could not locate the checked-in Contentstack recipe",
            cause
          )
        )
      );

    return ContentstackRecipe.of({
      materialize: Effect.fn("ContentstackRecipe.materialize")(function* ({
        localUrl,
        productionUrl,
        targetMasterLocale,
      }) {
        const normalizedLocalUrl = yield* normalizeHttpUrl(
          "Local URL",
          localUrl
        );
        const normalizedProductionUrl = yield* normalizeHttpUrl(
          "Production URL",
          productionUrl
        );
        const normalizedMasterLocale = targetMasterLocale.trim().toLowerCase();

        if (normalizedMasterLocale.length === 0) {
          return yield* recipeError(
            "render",
            "The target stack master locale cannot be empty",
            new Error("Target stack master locale was empty")
          );
        }
        const temporaryRoot = yield* fileSystem
          .makeTempDirectoryScoped({ prefix: "next-hydra-contentstack-" })
          .pipe(
            Effect.mapError((cause) =>
              recipeError(
                "copy",
                "Could not create a temporary Contentstack recipe directory",
                cause
              )
            )
          );
        const directory = path.join(temporaryRoot, "recipe");

        yield* fileSystem
          .copy(sourceDirectory, directory)
          .pipe(
            Effect.mapError((cause) =>
              recipeError(
                "copy",
                "Could not copy the checked-in Contentstack recipe",
                cause
              )
            )
          );

        const environmentsPath = path.join(
          directory,
          "environments",
          "environments.json"
        );
        const environments = yield* fileSystem
          .readFileString(environmentsPath)
          .pipe(
            Effect.mapError((cause) =>
              recipeError(
                "render",
                "Could not read the Contentstack environment recipe",
                cause
              )
            )
          );

        if (
          !environments.includes(LOCAL_URL_PLACEHOLDER) ||
          !environments.includes(PRODUCTION_URL_PLACEHOLDER)
        ) {
          return yield* recipeError(
            "render",
            "The Contentstack environment recipe is missing URL placeholders",
            new Error("Recipe URL placeholders were not found")
          );
        }

        const rendered = environments
          .replaceAll(LOCAL_URL_PLACEHOLDER, normalizedLocalUrl)
          .replaceAll(PRODUCTION_URL_PLACEHOLDER, normalizedProductionUrl);

        yield* fileSystem
          .writeFileString(environmentsPath, rendered)
          .pipe(
            Effect.mapError((cause) =>
              recipeError(
                "render",
                "Could not render Contentstack environment URLs",
                cause
              )
            )
          );

        if (normalizedMasterLocale !== "en-us") {
          const localesDirectory = path.join(directory, "locales");
          const sourceMasterLocale = yield* fileSystem
            .readFileString(path.join(localesDirectory, "master-locale.json"))
            .pipe(
              Effect.mapError((cause) =>
                recipeError(
                  "render",
                  "Could not read the Contentstack source master locale",
                  cause
                )
              )
            );

          yield* fileSystem
            .writeFileString(
              path.join(localesDirectory, "locales.json"),
              sourceMasterLocale
            )
            .pipe(
              Effect.mapError((cause) =>
                recipeError(
                  "render",
                  "Could not map the English starter entries to the target stack locale",
                  cause
                )
              )
            );
        }

        return new ContentstackRecipeReceipt({
          directory,
          environments: [...CONTENTSTACK_ENVIRONMENTS],
          version: CONTENTSTACK_RECIPE_VERSION,
        });
      }),
    });
  })
);
