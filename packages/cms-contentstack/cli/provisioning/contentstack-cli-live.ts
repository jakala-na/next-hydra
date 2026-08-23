import { getContentstackEndpoint } from "@contentstack/utils";
import { Effect, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import packageManifest from "../../package.json" with { type: "json" };
import { ContentstackCli } from "./contentstack-cli";
import type { ImportContentstackRecipeOptions } from "./contentstack-cli";
import {
  ContentstackCliError,
  ContentstackRuntimeEndpoints,
  ContentstackStack,
} from "./model";

export const CONTENTSTACK_CLI_VERSION =
  packageManifest.dependencies["@contentstack/cli"];

const TokenAlias = Schema.Struct({
  alias: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
  type: Schema.NonEmptyString,
});

const TokenAliases = Schema.Array(TokenAlias);
const CONFIGURED_REGION_PATTERN =
  /Currently using the '(?<region>[^']+)' region\./u;
const decodeEndpoint = Schema.decodeUnknownSync(Schema.NonEmptyString);

const cliError = (
  operation: ContentstackCliError["operation"],
  message: string,
  cause: unknown
) => new ContentstackCliError({ cause, message, operation });

const subprocessDiagnostics = (stdout: string, stderr: string) => {
  const diagnostics = [stderr.trim(), stdout.trim()].filter(
    (output) => output.length > 0
  );

  return diagnostics.length === 0 ? "" : `\n${diagnostics.join("\n")}`;
};

const subprocessCause = (exitCode: number, stdout: string, stderr: string) => {
  const diagnosticSuffix = subprocessDiagnostics(stdout, stderr);

  return new Error(
    `Contentstack CLI exited with code ${exitCode}${diagnosticSuffix}`
  );
};

const collectOutput = Effect.fn("ContentstackCli.collectOutput")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: ChildProcess.Command,
  operation: ContentstackCliError["operation"],
  message: string
) {
  const handle = yield* spawner
    .spawn(command)
    .pipe(Effect.mapError((cause) => cliError(operation, message, cause)));
  const result = yield* Effect.all(
    {
      exitCode: handle.exitCode,
      stderr: Stream.decodeText(handle.stderr).pipe(Stream.mkString),
      stdout: Stream.decodeText(handle.stdout).pipe(Stream.mkString),
    },
    { concurrency: "unbounded" }
  ).pipe(Effect.mapError((cause) => cliError(operation, message, cause)));

  if (result.exitCode !== 0) {
    return yield* cliError(
      operation,
      message,
      subprocessCause(result.exitCode, result.stdout, result.stderr)
    );
  }

  return result;
});

const importRecipe = Effect.fn("ContentstackCli.importRecipe")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  executable: string,
  options: ImportContentstackRecipeOptions
) {
  const args = [
    executable,
    "cm:stacks:import",
    "--alias",
    options.managementTokenAlias,
    "--data-dir",
    options.directory,
    "--yes",
    "--import-webhook-status",
    "disable",
  ];

  const command = ChildProcess.make(process.execPath, args, {
    stderr: "pipe",
    stdin: "inherit",
    stdout: "pipe",
  });
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      return yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stderr: handle.stderr.pipe(
            Stream.decodeText,
            Stream.tap((chunk) =>
              Effect.sync(() => {
                process.stderr.write(chunk);
              })
            ),
            Stream.runFold(
              () => "",
              (output, chunk) => output + chunk
            )
          ),
          stdout: handle.stdout.pipe(
            Stream.decodeText,
            Stream.tap((chunk) =>
              Effect.sync(() => {
                process.stdout.write(chunk);
              })
            ),
            Stream.runFold(
              () => "",
              (output, chunk) => output + chunk
            )
          ),
        },
        { concurrency: "unbounded" }
      );
    })
  ).pipe(
    Effect.mapError((cause) =>
      cliError(
        "import",
        "Contentstack could not import the starter recipe",
        cause
      )
    )
  );

  // The provider-owned pnpm patch makes CSDX set a nonzero exit code when its
  // import command catches and reports an importer exception.
  if (result.exitCode !== 0) {
    return yield* cliError(
      "import",
      "Contentstack could not import the starter recipe",
      subprocessCause(result.exitCode, result.stdout, result.stderr)
    );
  }

  return yield* Effect.void;
});

const contentstackEndpoint = Effect.fn("ContentstackCli.endpoint")(function* (
  region: string,
  service: "graphqlDelivery" | "graphqlPreview"
) {
  return yield* Effect.try({
    catch: (cause) =>
      cliError(
        "region",
        `Could not resolve the ${service} endpoint for Contentstack region ${region}`,
        cause
      ),
    try: () => decodeEndpoint(getContentstackEndpoint(region, service, true)),
  });
});

export const contentstackCliLayer = Layer.effect(
  ContentstackCli,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const executableUrl = yield* Effect.try({
      catch: (cause) =>
        cliError(
          "version",
          "Could not locate the pinned Contentstack CLI",
          cause
        ),
      try: () => new URL(import.meta.resolve("@contentstack/cli/bin/run.js")),
    });
    const executable = yield* path.fromFileUrl(executableUrl);

    const command = (...args: readonly string[]) =>
      ChildProcess.make(process.execPath, [executable, ...args], {
        stderr: "pipe",
        stdin: "ignore",
        stdout: "pipe",
      });

    return ContentstackCli.of({
      importRecipe: Effect.fn("ContentstackCli.importRecipeLive")(
        function* (options) {
          return yield* importRecipe(spawner, executable, options);
        }
      ),
      resolveStack: Effect.fn("ContentstackCli.resolveStack")(
        function* (managementTokenAlias) {
          return yield* Effect.scoped(
            collectOutput(
              spawner,
              command(
                "auth:tokens:list",
                "--columns",
                "alias,type,apiKey",
                "--filter",
                `alias=${managementTokenAlias}`,
                "--output",
                "json"
              ),
              "resolveAlias",
              `Could not resolve Contentstack Management Token alias ${managementTokenAlias}`
            )
          ).pipe(
            Effect.flatMap(({ stdout }) =>
              Schema.decodeEffect(Schema.fromJsonString(TokenAliases))(stdout)
            ),
            Effect.flatMap((aliases) => {
              const match = aliases.find(
                (candidate) => candidate.alias === managementTokenAlias
              );

              if (match === undefined) {
                return Effect.fail(
                  cliError(
                    "resolveAlias",
                    `Could not resolve Contentstack Management Token alias ${managementTokenAlias}`,
                    new Error(
                      `No Contentstack token alias named ${managementTokenAlias} was found`
                    )
                  )
                );
              }

              if (match.type !== "management") {
                return Effect.fail(
                  cliError(
                    "resolveAlias",
                    `Could not resolve Contentstack Management Token alias ${managementTokenAlias}`,
                    new Error(
                      `Contentstack token alias ${managementTokenAlias} is ${match.type}, not management`
                    )
                  )
                );
              }

              return Schema.decodeEffect(ContentstackStack)({
                apiKey: match.apiKey,
                managementTokenAlias,
              }).pipe(
                Effect.mapError((cause) =>
                  cliError(
                    "resolveAlias",
                    `Could not resolve Contentstack Management Token alias ${managementTokenAlias}`,
                    cause
                  )
                )
              );
            }),
            Effect.mapError((cause) =>
              Schema.is(ContentstackCliError)(cause)
                ? cause
                : cliError(
                    "resolveAlias",
                    `Could not resolve Contentstack Management Token alias ${managementTokenAlias}`,
                    cause
                  )
            )
          );
        }
      ),
      runtimeEndpoints: Effect.fn("ContentstackCli.runtimeEndpoints")(
        function* () {
          const output = yield* Effect.scoped(
            collectOutput(
              spawner,
              command("config:get:region"),
              "region",
              "Could not read the configured Contentstack CLI region"
            )
          );
          const region = CONFIGURED_REGION_PATTERN.exec(output.stdout)?.groups
            ?.region;

          if (region === undefined) {
            return yield* cliError(
              "region",
              "Could not read the configured Contentstack CLI region",
              new Error(
                `Contentstack CLI region output was not recognized${subprocessDiagnostics(output.stdout, output.stderr)}`
              )
            );
          }

          const graphqlHost = yield* contentstackEndpoint(
            region,
            "graphqlDelivery"
          );
          const graphqlPreviewHost = yield* contentstackEndpoint(
            region,
            "graphqlPreview"
          );

          return new ContentstackRuntimeEndpoints({
            graphqlHost,
            graphqlPreviewHost,
            region,
          });
        }
      ),
      version: Effect.fn("ContentstackCli.version")(function* () {
        const output = yield* Effect.scoped(
          collectOutput(
            spawner,
            command("--version"),
            "version",
            "Could not run the pinned Contentstack CLI"
          )
        );
        return output.stdout.trim();
      }),
    });
  }).pipe(
    Effect.mapError((cause) =>
      cliError("version", "Could not locate the pinned Contentstack CLI", cause)
    )
  )
);
