import { expect, it } from "@effect/vitest";
import {
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  PlatformError,
  Schema,
} from "effect";

import { Workspaces } from "../src/workspaces.ts";
import {
  memoryWorkspace,
  memoryWorkspaceServices,
} from "./fixtures/memory-workspace.ts";

it.effect(
  "rejects initialization state that claims application source as a setting",
  () =>
    Effect.gen(function* () {
      const root = "/source/workspaces/editorial-site";
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          writeFile: (file, bytes, options) =>
            file === `${root}/apps/web/.env.local`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "writeFile",
                    module: "FileSystem",
                  })
                )
              : fs.writeFile(file, bytes, options),
        }),
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const named = Workspaces.pipe(
          Effect.flatMap((api) =>
            api.named({
              name: "editorial-site",
              sourceRoot: "/source",
            })
          )
        );
        yield* (yield* named)
          .sync({
            environment: "copy-missing-local",
            install: "skip",
          })
          .pipe(Effect.flip);
        const record = Schema.Record(Schema.String, Schema.Unknown);
        const json = Schema.fromJsonString(record);
        const receiptPath = `${root}/.workspace-composition.json`;
        const receipt = yield* Schema.decodeEffect(json)(
          yield* fs.readFileString(receiptPath)
        );
        const pending = yield* Schema.decodeUnknownEffect(record)(
          receipt.pending
        );
        const damaged = yield* Schema.encodeEffect(json)({
          ...receipt,
          pending: {
            ...pending,
            initialization: [
              { status: "completed", target: "apps/web/layout.tsx" },
            ],
          },
        });
        yield* fs.writeFileString(receiptPath, damaged);
        expect(
          yield* named.pipe(
            Effect.flatMap((workspace) => workspace.sync({ install: "skip" })),
            Effect.provide(memoryWorkspaceServices()),
            Effect.flip
          )
        ).toMatchObject({ _tag: "WorkspaceStateInvalid" });
        expect(yield* fs.readFileString(receiptPath)).toBe(damaged);
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "export function Layout() {\n  return <main>Hello</main>;\n}\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "resumes after a completed credential copy without recopying credentials",
  () =>
    Effect.gen(function* () {
      const root = "/source/workspaces/editorial-site";
      const target = `${root}/apps/web/.env.local`;
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      let inspecting = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          readFile: (file) =>
            inspecting && file === target
              ? Effect.die(
                  new Error("Recovery must not read credential contents")
                )
              : fs.readFile(file),
          writeFile: (file, bytes, options) =>
            file === target
              ? Deferred.succeed(entered, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.andThen(fs.writeFile(file, bytes, options))
                )
              : fs.writeFile(file, bytes, options),
        }),
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const named = Workspaces.pipe(
          Effect.flatMap((api) =>
            api.named({
              name: "editorial-site",
              sourceRoot: "/source",
            })
          )
        );
        const running = yield* (yield* named)
          .sync({
            environment: "copy-missing-local",
            install: "skip",
          })
          .pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        const stopping = yield* Fiber.interrupt(running).pipe(
          Effect.forkChild({ startImmediately: true })
        );
        expect(
          yield* (yield* named).sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({ _tag: "WorkspaceLockAuthorizationRequired" });
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(stopping);
        yield* fs.writeFileString(`${root}/.gitignore`, "# my rules\n");
        yield* fs.remove("/source/local-environment/checkout.env.example");
        inspecting = true;
        const result = yield* named.pipe(
          Effect.flatMap((workspace) => workspace.sync({ install: "skip" })),
          Effect.provide(memoryWorkspaceServices())
        );
        inspecting = false;
        expect(result.environmentFilesCreated).toEqual([]);
        expect(yield* fs.readFileString(target)).toBe(
          "TOKEN=checkout-example-value\nNEXT_PUBLIC_SITE_URL=http://custom.localhost:1355\n"
        );
        expect((yield* fs.stat(target)).mode % 0o1000).toBe(0o600);
        expect(yield* fs.readFileString(`${root}/.gitignore`)).toBe(
          "# my rules\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "retains the lease if a credential copy finishes but its completion cannot be recorded",
  () =>
    Effect.gen(function* () {
      const root = "/source/workspaces/editorial-site";
      const target = `${root}/apps/web/.env.local`;
      let copied = false;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          rename: (source, destination) =>
            copied && destination === `${root}/.workspace-composition.json`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "rename",
                    module: "FileSystem",
                  })
                )
              : fs.rename(source, destination),
          writeFile: (file, bytes, options) =>
            fs.writeFile(file, bytes, options).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (file === target) {
                    copied = true;
                  }
                })
              )
            ),
        }),
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const named = Workspaces.pipe(
          Effect.flatMap((api) =>
            api.named({
              name: "editorial-site",
              sourceRoot: "/source",
            })
          )
        );
        yield* (yield* named)
          .sync({
            environment: "copy-missing-local",
            install: "skip",
          })
          .pipe(Effect.exit);
        copied = false;
        expect(
          yield* named.pipe(
            Effect.flatMap((workspace) => workspace.sync({ install: "skip" })),
            Effect.provide(memoryWorkspaceServices()),
            Effect.flip
          )
        ).toMatchObject({ _tag: "WorkspaceLockAuthorizationRequired" });
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock/receipt.json`)
        ).toBeTruthy();
        expect(yield* fs.readFileString(target)).toBe(
          "TOKEN=checkout-example-value\nNEXT_PUBLIC_SITE_URL=http://custom.localhost:1355\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "keeps examples as documentation without creating runtime env files in fresh or named workspaces",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application", {
        localEnvironment: [
          {
            source: "/must-not-read-without-opt-in",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const api = yield* Workspaces;
        const fresh = yield* api.fresh({
          destination: "/application",
          name: "garden-site",
          selection: { addOns: [], providers: {} },
          source: { kind: "working-tree", root: "/source" },
        });
        const named = yield* api.named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        for (const result of [
          yield* fresh.materialize({ install: "skip" }),
          yield* named.sync({ install: "skip" }),
        ]) {
          expect(
            yield* fs.exists(`${result.destination}/apps/web/.env.example`)
          ).toBeTruthy();
          expect(
            yield* fs.exists(`${result.destination}/apps/web/.env.local`)
          ).toBeFalsy();
          expect(result.environmentFilesCreated).toEqual([]);
        }
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "does not replay an earlier copy-env request when initialization never started",
  () =>
    Effect.gen(function* () {
      const root = "/source/workspaces/editorial-site";
      let rejectWrite = true;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          writeFile: (file, bytes, options) =>
            rejectWrite && file === `${root}/apps/web/layout.tsx`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "writeFile",
                    module: "FileSystem",
                  })
                )
              : fs.writeFile(file, bytes, options),
        }),
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const named = Workspaces.pipe(
          Effect.flatMap((api) =>
            api.named({
              name: "editorial-site",
              sourceRoot: "/source",
            })
          )
        );
        expect(
          yield* (yield* named)
            .sync({
              environment: "copy-missing-local",
              install: "skip",
            })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "MaterializationFailed" });
        rejectWrite = false;
        const result = yield* named.pipe(
          Effect.flatMap((workspace) => workspace.sync({ install: "skip" })),
          Effect.provide(memoryWorkspaceServices())
        );
        expect(result.environmentFilesCreated).toEqual([]);
        expect(yield* fs.exists(`${root}/apps/web/.env.local`)).toBeFalsy();
        expect(yield* fs.exists(`${root}/.gitignore`)).toBeTruthy();
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          "export function Layout() {\n  return <main>Hello</main>;\n}\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "retries a missing credential copy without overwriting an earlier completed copy",
  () =>
    Effect.gen(function* () {
      const root = "/source/workspaces/editorial-site";
      let rejectWrite = true;
      const local = [
        {
          source: "/source/local-environment/checkout.env.example",
          target: "apps/web/.env.local",
        },
        {
          source: "/source/local-environment/primary.env.example",
          target: ".env.local",
        },
      ];
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          writeFile: (file, bytes, options) =>
            rejectWrite && file === `${root}/.env.local`
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "writeFile",
                    module: "FileSystem",
                  })
                )
              : fs.writeFile(file, bytes, options),
        }),
        localEnvironment: local,
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const named = Workspaces.pipe(
          Effect.flatMap((api) =>
            api.named({
              name: "editorial-site",
              sourceRoot: "/source",
            })
          )
        );
        const options = {
          environment: "copy-missing-local",
          install: "skip",
        } as const;
        expect(
          yield* (yield* named).sync(options).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "EnvironmentInitializationFailed",
          createdFiles: ["apps/web/.env.local"],
          failedFile: ".env.local",
        });
        rejectWrite = false;
        yield* fs.writeFileString(
          `${root}/apps/web/.env.local`,
          "TOKEN=edited-example-value\n"
        );
        yield* fs.chmod(`${root}/apps/web/.env.local`, 0o400);
        const result = yield* named.pipe(
          Effect.flatMap((workspace) => workspace.sync(options)),
          Effect.provide(memoryWorkspaceServices(local))
        );
        expect(result.environmentFilesCreated).toEqual([".env.local"]);
        expect(yield* fs.readFileString(`${root}/apps/web/.env.local`)).toBe(
          "TOKEN=edited-example-value\n"
        );
        expect(
          (yield* fs.stat(`${root}/apps/web/.env.local`)).mode % 0o1000
        ).toBe(0o400);
        expect(yield* fs.readFileString(`${root}/.env.local`)).toBe(
          "TOKEN=primary-example-value\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects registry attempts to turn examples into runtime environment files before publishing source",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const registry = yield* fs.readFileString("/source/registry.json");
        yield* fs.writeFileString(
          "/source/registry.json",
          registry.replace(
            '"target": "~/apps/web/.env.example"',
            '"target": "~/apps/web/.env.local"'
          )
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(
          yield* fs.exists("/source/workspaces/editorial-site/package.json")
        ).toBeFalsy();
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/.env.local"
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "copies requested local credentials only into materialized directories",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application", {
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
          {
            source: "/source/local-environment/primary.env.example",
            target: "apps/unused/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        const result = yield* workspace.sync({
          environment: "copy-missing-local",
          install: "skip",
        });
        expect(
          yield* fs.readFileString(`${result.destination}/apps/web/.env.local`)
        ).toBe(
          "TOKEN=checkout-example-value\nNEXT_PUBLIC_SITE_URL=http://custom.localhost:1355\n"
        );
        expect(
          yield* fs.exists(`${result.destination}/apps/unused`)
        ).toBeFalsy();
        expect(result.environmentFilesCreated).toEqual(["apps/web/.env.local"]);
        expect(
          (yield* fs.stat(`${result.destination}/apps/web/.env.local`)).mode %
            0o1000
        ).toBe(0o600);
        expect(
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
            result
          )
        ).not.toContain("checkout-example-value");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "preserves existing environment bytes and permissions while initializing application source",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application", {
        localEnvironment: [
          {
            source: "/missing-credential-source",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const target = "/source/workspaces/configured-site/apps/web/.env.local";
        yield* fs.writeFileString(target, "TOKEN=local-example-value\n", {
          mode: 0o400,
        });
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        const result = yield* workspace.sync({
          environment: "copy-missing-local",
          install: "skip",
        });
        expect(yield* fs.readFileString(target)).toBe(
          "TOKEN=local-example-value\n"
        );
        expect((yield* fs.stat(target)).mode % 0o1000).toBe(0o400);
        expect(result.environmentFilesCreated).toEqual([]);
        expect(
          yield* fs.exists(`${result.destination}/apps/web/layout.tsx`)
        ).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "reports a partial environment write without exposing private diagnostics or overwriting it on retry",
  () =>
    Effect.gen(function* () {
      const target = "/source/workspaces/editorial-site/apps/web/.env.local";
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          writeFile: (file, bytes, options) =>
            file === target
              ? fs.writeFile(file, bytes.slice(0, 4), options).pipe(
                  Effect.andThen(
                    Effect.fail(
                      PlatformError.systemError({
                        _tag: "PermissionDenied",
                        cause: new Error("private-example-diagnostic"),
                        method: "writeFile",
                        module: "FileSystem",
                        pathOrDescriptor: file,
                      })
                    )
                  )
                )
              : fs.writeFile(file, bytes, options),
        }),
        localEnvironment: [
          {
            source: "/source/local-environment/checkout.env.example",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        const error = yield* workspace
          .sync({ environment: "copy-missing-local", install: "skip" })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "EnvironmentInitializationFailed",
          createdFiles: [],
          failedFile: "apps/web/.env.local",
        });
        expect(
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
            error
          )
        ).not.toContain("private-example-diagnostic");
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/layout.tsx"
          )
        ).toBeTruthy();
        expect(
          yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
        ).toMatchObject({
          _tag: "WorkspaceRecoveryRequired",
          paths: ["apps/web/.env.local"],
        });
        expect(yield* fs.readFileString(target)).toBe("TOKE");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "does not publish application files when a requested local environment source has disappeared",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application", {
        localEnvironment: [
          {
            source: "/missing-credential-source",
            target: "apps/web/.env.local",
          },
        ],
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* (yield* Workspaces).named({
          name: "editorial-site",
          sourceRoot: "/source",
        });
        expect(
          yield* workspace
            .sync({ environment: "copy-missing-local", install: "skip" })
            .pipe(Effect.flip)
        ).toMatchObject({
          _tag: "PlatformError",
          reason: { _tag: "NotFound" },
        });
        expect(
          yield* fs.exists("/source/workspaces/editorial-site/package.json")
        ).toBeFalsy();
        expect(
          yield* fs.exists(
            "/source/workspaces/editorial-site/apps/web/.env.local"
          )
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);
