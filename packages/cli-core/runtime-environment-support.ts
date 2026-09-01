import { Effect, FileSystem, Path, Redacted, Schema, Terminal } from "effect";
import { Prompt } from "effect/unstable/cli";

import { RuntimeEnvironmentPreflightError } from "./runtime-environment-model";
import type {
  RuntimeEnvironmentDestinationName,
  RuntimeEnvironmentValue,
  RuntimeEnvironmentValues,
  RuntimeEnvironmentVariable,
} from "./runtime-environment-model";

export const runtimeEnvironmentPreflightError = (
  destination: RuntimeEnvironmentDestinationName,
  operation: RuntimeEnvironmentPreflightError["operation"],
  message: string,
  cause: unknown
) =>
  new RuntimeEnvironmentPreflightError({
    cause,
    destination,
    message,
    operation,
  });

export const decodeRuntimeEnvironmentJson = <S extends Schema.Top>(
  schema: S,
  value: string
) => Schema.decodeEffect(Schema.fromJsonString(schema))(value);

export const confirmRuntimeEnvironmentPublication = Effect.fn(
  "RuntimeEnvironment.confirm"
)(function* (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  terminal: Terminal.Terminal,
  message: string,
  yes: boolean,
  destination: RuntimeEnvironmentDestinationName
) {
  if (yes) {
    return yield* Effect.void;
  }
  const confirmed = yield* Prompt.run(
    Prompt.confirm({ initial: false, message })
  ).pipe(
    Effect.provideService(FileSystem.FileSystem, fileSystem),
    Effect.provideService(Path.Path, path),
    Effect.provideService(Terminal.Terminal, terminal),
    Effect.mapError((cause) =>
      runtimeEnvironmentPreflightError(
        destination,
        "confirmation",
        "Could not confirm runtime environment publication",
        cause
      )
    )
  );
  if (!confirmed) {
    return yield* runtimeEnvironmentPreflightError(
      destination,
      "confirmation",
      "Runtime environment publication was cancelled",
      new Error("User declined provisioning")
    );
  }
  return yield* Effect.void;
});

export const validateRuntimeEnvironmentManifest = (
  manifest: readonly RuntimeEnvironmentVariable[],
  destination: RuntimeEnvironmentDestinationName
): Effect.Effect<void, RuntimeEnvironmentPreflightError> => {
  const keys = manifest.map(({ key }) => key);
  const applicationsAreValid = manifest.every(
    ({ applications }) =>
      applications.length > 0 &&
      new Set(applications).size === applications.length
  );
  return keys.length > 0 &&
    new Set(keys).size === keys.length &&
    applicationsAreValid
    ? Effect.void
    : Effect.fail(
        runtimeEnvironmentPreflightError(
          destination,
          "validation",
          "Runtime environment variables and their application targets must be non-empty and unique",
          new Error("Invalid runtime environment manifest")
        )
      );
};

export const validateRuntimeEnvironmentValues = (
  manifest: readonly RuntimeEnvironmentVariable[],
  values: RuntimeEnvironmentValues,
  destination: RuntimeEnvironmentDestinationName
): Effect.Effect<void> => {
  const expected = new Set(manifest.map(({ key }) => key));
  const actual = Object.keys(values);
  const exactKeys =
    expected.size === actual.length && actual.every((key) => expected.has(key));
  const exactSensitivity = manifest.every(({ key, sensitive }) => {
    const value = values[key];
    return sensitive
      ? Redacted.isRedacted(value)
      : Schema.is(Schema.String)(value);
  });

  return exactKeys && exactSensitivity
    ? Effect.void
    : Effect.die(
        new Error(
          `Runtime environment values for ${destination} changed after destination preflight and no longer match the prepared manifest`
        )
      );
};

export const revealRuntimeEnvironmentValue = (
  value: RuntimeEnvironmentValue | undefined
) =>
  Redacted.isRedacted(value)
    ? Redacted.value(value)
    : Schema.decodeUnknownSync(Schema.String)(value);
