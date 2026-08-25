import { getContentstackEndpoint } from "@contentstack/utils";
import { Effect, Layer, Path, Schema, Stdio, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import packageManifest from "../../package.json" with { type: "json" };
import { ContentstackCli } from "./contentstack-cli";
import type {
  ImportContentstackRecipeOptions,
  RunContentstackMigrationOptions,
} from "./contentstack-cli";
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
  token: Schema.RedactedFromValue(Schema.NonEmptyString, {
    label: "Contentstack Management Token",
  }),
  type: Schema.NonEmptyString,
});

const TokenAliases = Schema.Array(TokenAlias);
const CONFIGURED_REGION_PATTERN =
  /Currently using the '(?<region>[^']+)' region\./u;
const DIAGNOSTIC_TAIL_SIZE = 16_384;
const decodeEndpoint = Schema.decodeUnknownSync(Schema.NonEmptyString);

interface RunCommandOptions {
  readonly includeStdoutInFailure?: boolean;
  readonly output: "collect" | "stream";
}

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

export const retainDiagnosticTail = (output: string, chunk: string) =>
  `${output}${chunk}`.slice(-DIAGNOSTIC_TAIL_SIZE);

const runCommand = Effect.fn("ContentstackCli.runCommand")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  stdio: Stdio.Stdio,
  command: ChildProcess.Command,
  operation: ContentstackCliError["operation"],
  message: string,
  options: RunCommandOptions
) {
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const drain = (
        stream: typeof handle.stdout,
        channel: "stderr" | "stdout"
      ) => {
        const decoded = Stream.decodeText(stream);
        const forwarded =
          options.output === "stream"
            ? Stream.tapSink(
                decoded,
                channel === "stdout" ? stdio.stdout() : stdio.stderr()
              )
            : decoded;

        return forwarded.pipe(
          options.output === "stream"
            ? Stream.runFold(
                () => "",
                (output, chunk) => retainDiagnosticTail(output, chunk)
              )
            : Stream.mkString
        );
      };

      return yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stderr: drain(handle.stderr, "stderr"),
          stdout: drain(handle.stdout, "stdout"),
        },
        { concurrency: "unbounded" }
      );
    })
  ).pipe(Effect.mapError((cause) => cliError(operation, message, cause)));

  if (result.exitCode !== 0) {
    return yield* cliError(
      operation,
      message,
      subprocessCause(
        result.exitCode,
        options.includeStdoutInFailure === false ? "" : result.stdout,
        result.stderr
      )
    );
  }

  return result;
});

const importRecipe = Effect.fn("ContentstackCli.importRecipe")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  stdio: Stdio.Stdio,
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
  // The provider-owned pnpm patch makes CSDX set a nonzero exit code when its
  // import command catches and reports an importer exception.
  yield* runCommand(
    spawner,
    stdio,
    command,
    "import",
    "Contentstack could not import the starter recipe",
    { output: "stream" }
  );
});

const runMigration = Effect.fn("ContentstackCli.runMigration")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  stdio: Stdio.Stdio,
  executable: string,
  options: RunContentstackMigrationOptions
) {
  const command = ChildProcess.make(
    process.execPath,
    [
      executable,
      "cm:stacks:migration",
      "--alias",
      options.managementTokenAlias,
      "--file-path",
      options.file,
    ],
    {
      stderr: "pipe",
      stdin: "inherit",
      stdout: "pipe",
    }
  );
  // The provider-owned pnpm patch makes CSDX preserve a nonzero exit status
  // for validation, script, and Content Management API failures.
  yield* runCommand(
    spawner,
    stdio,
    command,
    "migrate",
    `Contentstack could not apply migration ${options.file}`,
    { output: "stream" }
  );
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
    const stdio = yield* Stdio.Stdio;
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
          return yield* importRecipe(spawner, stdio, executable, options);
        }
      ),
      resolveStack: Effect.fn("ContentstackCli.resolveStack")(
        function* (managementTokenAlias) {
          return yield* runCommand(
            spawner,
            stdio,
            command(
              "auth:tokens:list",
              "--columns",
              "alias,type,apiKey,token",
              "--filter",
              `alias=${managementTokenAlias}`,
              "--output",
              "json"
            ),
            "resolveAlias",
            `Could not resolve Contentstack Management Token alias ${managementTokenAlias}`,
            { includeStdoutInFailure: false, output: "collect" }
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
                managementToken: match.token,
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
      runMigration: Effect.fn("ContentstackCli.runMigrationLive")(
        function* (options) {
          return yield* runMigration(spawner, stdio, executable, options);
        }
      ),
      runtimeEndpoints: Effect.fn("ContentstackCli.runtimeEndpoints")(
        function* () {
          const output = yield* runCommand(
            spawner,
            stdio,
            command("config:get:region"),
            "region",
            "Could not read the configured Contentstack CLI region",
            { output: "collect" }
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
        const output = yield* runCommand(
          spawner,
          stdio,
          command("--version"),
          "version",
          "Could not run the pinned Contentstack CLI",
          { output: "collect" }
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
