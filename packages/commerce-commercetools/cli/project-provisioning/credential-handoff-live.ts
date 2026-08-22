import {
  Config,
  ConfigProvider,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Path,
  Redacted,
  Ref,
  Schema,
} from "effect";

import { RuntimeCredentialHandoff } from "./credential-handoff";
import type { RuntimeCredentials } from "./model";
import { CredentialFileError, CredentialFileReceipt } from "./model";

const PRIVATE_FILE_MODE = 0o600;
const PERMISSION_RANGE = 0o1000;

const runtimeEnvironment = (credentials: RuntimeCredentials) => ({
  COMMERCETOOLS_CLIENT_ID: credentials.clientId,
  COMMERCETOOLS_CLIENT_SECRET: Redacted.value(credentials.clientSecret),
  COMMERCETOOLS_PROJECT_KEY: credentials.projectKey,
  COMMERCETOOLS_REGION: credentials.region,
  COMMERCETOOLS_SCOPE: credentials.scope,
});

const renderDotEnv = (values: ReturnType<typeof runtimeEnvironment>) =>
  `${Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n")}\n`;

const credentialFileError = (
  operation: CredentialFileError["operation"],
  path: string,
  cause: unknown
) =>
  new CredentialFileError({
    cause,
    message: `Could not ${operation} the runtime credential file`,
    operation,
    path,
  });

const verifyCredentialFile = Effect.fn("CredentialHandoff.verify")(function* (
  fileSystem: FileSystem.FileSystem,
  absolutePath: string,
  expected: ReturnType<typeof runtimeEnvironment>,
  rendered: string
) {
  const contents = yield* fileSystem.readFileString(absolutePath);
  const info = yield* fileSystem.stat(absolutePath);

  if (
    info.type !== "File" ||
    info.mode % PERMISSION_RANGE !== PRIVATE_FILE_MODE ||
    contents !== rendered
  ) {
    return yield* credentialFileError(
      "verify",
      absolutePath,
      new Error("Runtime credential file contents or permissions did not match")
    );
  }

  const provider = ConfigProvider.fromDotEnvContents(contents);
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = yield* Config.nonEmptyString(key).parse(provider);
    if (actualValue !== expectedValue) {
      return yield* credentialFileError(
        "verify",
        absolutePath,
        new Error(`Runtime credential file value did not match for ${key}`)
      );
    }
  }

  return new CredentialFileReceipt({
    mode: PRIVATE_FILE_MODE,
    path: absolutePath,
  });
});

export const runtimeCredentialHandoffLayer = Layer.effect(
  RuntimeCredentialHandoff,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return RuntimeCredentialHandoff.of({
      save: Effect.fn("CredentialHandoff.save")(
        function* (credentials, destination) {
          const absolutePath = path.resolve(process.cwd(), destination);
          const expected = runtimeEnvironment(credentials);
          const rendered = renderDotEnv(expected);
          const created = yield* Ref.make(false);
          const publish = Effect.scoped(
            Effect.gen(function* () {
              const file = yield* fileSystem.open(absolutePath, {
                flag: "wx",
                mode: PRIVATE_FILE_MODE,
              });
              yield* Ref.set(created, true);
              yield* file.writeAll(new TextEncoder().encode(rendered));
              yield* file.sync;
              yield* fileSystem.chmod(absolutePath, PRIVATE_FILE_MODE);
            })
          );

          const publishAndVerify = publish.pipe(
            Effect.mapError((cause) =>
              credentialFileError("publish", absolutePath, cause)
            ),
            Effect.andThen(
              verifyCredentialFile(
                fileSystem,
                absolutePath,
                expected,
                rendered
              ).pipe(
                Effect.mapError((cause) =>
                  Schema.is(CredentialFileError)(cause)
                    ? cause
                    : credentialFileError("verify", absolutePath, cause)
                )
              )
            )
          );

          return yield* publishAndVerify.pipe(
            Effect.onExit((exit) =>
              Exit.isFailure(exit)
                ? Ref.get(created).pipe(
                    Effect.flatMap((didCreate) =>
                      didCreate
                        ? fileSystem
                            .remove(absolutePath, { force: true })
                            .pipe(
                              Effect.mapError((cause) =>
                                credentialFileError(
                                  "cleanup",
                                  absolutePath,
                                  cause
                                )
                              )
                            )
                        : Effect.void
                    )
                  )
                : Effect.void
            )
          );
        }
      ),
    });
  })
);
