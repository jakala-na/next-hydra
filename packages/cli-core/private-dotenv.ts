/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- Effect Schema classes define this private-file boundary. */

import {
  Context,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Path,
  Ref,
  Schema,
} from "effect";

const PRIVATE_FILE_MODE = 0o600;
const PERMISSION_RANGE = 0o1000;

export class PrivateDotEnvFileReceipt extends Schema.Class<PrivateDotEnvFileReceipt>(
  "PrivateDotEnvFileReceipt"
)({
  mode: Schema.Int,
  path: Schema.NonEmptyString,
}) {}

export class PrivateDotEnvFileError extends Schema.TaggedError<PrivateDotEnvFileError>()(
  "PrivateDotEnvFileError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["cleanup", "publish", "verify"]),
    path: Schema.String,
  }
) {}

const privateDotEnvFileError = (
  operation: PrivateDotEnvFileError["operation"],
  path: string,
  cause: unknown
) =>
  new PrivateDotEnvFileError({
    cause,
    message: `Could not ${operation} the private dotenv file`,
    operation,
    path,
  });

const renderDotEnv = (values: Readonly<Record<string, string>>) =>
  `${Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n")}\n`;

interface PrivateDotEnvFileValue {
  readonly publish: (
    values: Readonly<Record<string, string>>,
    destination: string
  ) => Effect.Effect<PrivateDotEnvFileReceipt, PrivateDotEnvFileError>;
}

export class PrivateDotEnvFile extends Context.Service<
  PrivateDotEnvFile,
  PrivateDotEnvFileValue
>()("@repo/cli-core/PrivateDotEnvFile") {}

const verifyPrivateDotEnvFile = Effect.fn("PrivateDotEnvFile.verify")(
  function* (
    fileSystem: FileSystem.FileSystem,
    absolutePath: string,
    rendered: string
  ) {
    const { contents, info } = yield* Effect.all({
      contents: fileSystem.readFileString(absolutePath),
      info: fileSystem.stat(absolutePath),
    }).pipe(
      Effect.mapError((cause) =>
        privateDotEnvFileError("verify", absolutePath, cause)
      )
    );

    if (
      info.type !== "File" ||
      info.mode % PERMISSION_RANGE !== PRIVATE_FILE_MODE ||
      contents !== rendered
    ) {
      return yield* privateDotEnvFileError(
        "verify",
        absolutePath,
        new Error("Dotenv contents or permissions did not match")
      );
    }

    return new PrivateDotEnvFileReceipt({
      mode: PRIVATE_FILE_MODE,
      path: absolutePath,
    });
  }
);

export const privateDotEnvFileLayer = Layer.effect(
  PrivateDotEnvFile,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return PrivateDotEnvFile.of({
      publish: Effect.fn("PrivateDotEnvFile.publish")(
        function* (values, destination) {
          const absolutePath = path.resolve(destination);
          const rendered = renderDotEnv(values);
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
          ).pipe(
            Effect.mapError((cause) =>
              privateDotEnvFileError("publish", absolutePath, cause)
            )
          );

          const publishAndVerify = publish.pipe(
            Effect.andThen(
              verifyPrivateDotEnvFile(fileSystem, absolutePath, rendered)
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
                                privateDotEnvFileError(
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
