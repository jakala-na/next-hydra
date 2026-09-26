import { expect, it } from "@effect/vitest";
import {
  Effect,
  FileSystem,
  Layer,
  PlatformError,
  Ref,
  Schema,
  Stdio,
} from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { applyEdits, modify } from "jsonc-parser";
import { describe } from "vitest";

import { command } from "../src/commands.ts";
import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";
import { packageManager } from "./fixtures/package-manager.ts";
import { terminalInput } from "./fixtures/terminal.ts";
import { exampleFiles } from "./fixtures/workspace.ts";

const noProcesses = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("Unexpected CLI process"))
);

const project = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory("/project");
  yield* fs.writeFileString(
    "/project/package.json",
    '{"name":"application","private":true}'
  );
  for (const [file, bytes] of yield* exampleFiles("registry")) {
    yield* fs.writeFile(`/project/${file}`, bytes);
  }
  return yield* (yield* Workspaces).existing({ root: "/project" });
});

it.effect(
  "installs dependencies from copied package manifests on addition and retry",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial", {
        processes: Layer.effect(
          ChildProcessSpawner.ChildProcessSpawner,
          packageManager((directory) =>
            Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              yield* fs.makeDirectory(
                `${directory}/packages/reporting/node_modules/tiny-invariant`,
                { recursive: true }
              );
              yield* fs.writeFileString(
                `${directory}/packages/reporting/node_modules/tiny-invariant/package.json`,
                '{"name":"tiny-invariant"}'
              );
              return 0;
            }).pipe(Effect.orDie)
          )
        ),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* fs.writeFileString(
          "/project/reporting.json",
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            files: [
              {
                content:
                  '{"name":"reporting","dependencies":{"tiny-invariant":"^1.3.3"}}',
                path: "package.json",
                target: "~/packages/reporting/package.json",
                type: "registry:file",
              },
            ],
            name: "reporting",
            type: "registry:item",
          })
        );
        const installed =
          "/project/packages/reporting/node_modules/tiny-invariant/package.json";
        yield* workspace.add({ overwrite: false, reference: "reporting.json" });
        expect(yield* fs.exists(installed)).toBeTruthy();
        yield* fs.remove(installed);
        yield* workspace.add({ overwrite: false, reference: "reporting.json" });
        expect(yield* fs.exists(installed)).toBeTruthy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "honors an added package's provider requirements before writing its files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        let item = yield* fs.readFileString("/project/banner.json");
        item = applyEdits(
          item,
          modify(item, ["meta", "nextHydra", "kind"], "package", {})
        );
        item = applyEdits(
          item,
          modify(
            item,
            ["meta", "nextHydra", "providerSlots"],
            { auth: "required" },
            {}
          )
        );
        yield* fs.writeFileString("/project/banner.json", item);
        expect(
          yield* workspace
            .inspectAdd({ reference: "banner.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "checks a known provider requirement without installing that provider's registry item",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const banner = yield* fs.readFileString("/project/banner.json");
        yield* fs.writeFileString(
          "/project/banner.json",
          applyEdits(
            banner,
            modify(
              banner,
              ["meta", "nextHydra", "compatibility"],
              { requires: ["next-hydra/auth/workos"] },
              {}
            )
          )
        );
        yield* fs.makeDirectory("/project/apps/web", { recursive: true });
        yield* fs.writeFileString(
          "/project/apps/web/package.json",
          '{"dependencies":{"@repo/auth":"workspace:@example/other-auth@*"}}'
        );
        expect(
          yield* workspace
            .add({ overwrite: true, reference: "banner.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
        yield* fs.writeFileString(
          "/project/apps/web/package.json",
          '{"dependencies":{"@repo/auth":"workspace:@repo/auth-workos@*"}}'
        );
        const inspection = yield* workspace.inspectAdd({
          reference: "banner.json",
        });
        expect(inspection.assumptions).toEqual([]);
        yield* workspace.add({
          expected: inspection.precondition,
          overwrite: false,
          reference: "banner.json",
        });
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "export const banner = 'Campaign';\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "requires reinspection when environment files change before a native environment addition",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const item = yield* fs.readFileString("/project/banner.json");
        yield* fs.writeFileString(
          "/project/banner.json",
          applyEdits(
            item,
            modify(item, ["envVars"], { CAMPAIGN_HOST: "campaign.example" }, {})
          )
        );
        const inspection = yield* workspace.inspectAdd({
          reference: "banner.json",
        });
        yield* fs.writeFileString(
          "/project/.env",
          "CAMPAIGN_HOST=local.example\n"
        );
        expect(
          yield* workspace
            .add({
              expected: inspection.precondition,
              overwrite: false,
              reference: "banner.json",
            })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "AdditionChanged" });
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
        expect(yield* fs.readFileString("/project/.env")).toBe(
          "CAMPAIGN_HOST=local.example\n"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects an ordinary package declaration that would bypass installed provider bindings",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const item = yield* fs.readFileString("/project/banner.json");
        yield* fs.writeFileString(
          "/project/banner.json",
          applyEdits(
            item,
            modify(
              item,
              ["meta", "nextHydra", "packages"],
              [
                {
                  cwd: ".",
                  name: "@repo/auth",
                  section: "dependencies",
                  specifier: "workspace:@example/other-auth@*",
                },
              ],
              {}
            )
          )
        );
        expect(
          yield* workspace
            .inspectAdd({ reference: "banner.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects incomplete package requirements during inspection instead of writing an empty dependency version",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const item = yield* fs.readFileString("/project/banner.json");
        yield* fs.writeFileString(
          "/project/banner.json",
          applyEdits(
            item,
            modify(
              item,
              ["meta", "nextHydra", "packages"],
              [
                {
                  cwd: ".",
                  name: "site-metrics",
                  section: "dependencies",
                  specifier: "",
                },
              ],
              {}
            )
          )
        );
        expect(
          yield* workspace
            .inspectAdd({ reference: "banner.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "adds an item through the CLI while --yes does not grant replacement permission",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* project;
        const run = Command.runWith(command("/project"), { version: "0.3.0" });
        yield* run(["add", "banner.json", "--yes"]);
        expect((yield* TestConsole.logLines).join("\n")).toContain(
          "Configure the campaign URL before publishing the banner."
        );
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "export const banner = 'Campaign';\n"
        );
        yield* fs.writeFileString("/project/apps/web/banner.ts", "Local work");
        expect(
          yield* run(["add", "banner.json", "--yes"]).pipe(Effect.flip)
        ).toMatchObject({ _tag: "AdditionConflict" });
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "Local work"
        );
        yield* run(["add", "banner.json", "-y", "-o"]);
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "export const banner = 'Campaign';\n"
        );
      }).pipe(
        Effect.provide([
          layer,
          noProcesses,
          terminalInput("cancel"),
          TestConsole.layer,
          Stdio.layerTest({
            stdinIsTerminal: Effect.succeed(false),
            stdoutIsTerminal: Effect.succeed(false),
          }),
        ])
      );
    })
);

describe.each(["no", "cancel", "noninteractive"] as const)(
  "addition confirmation: %s",
  (answer) => {
    it.effect("does not install without approval", () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("editorial");
        const prompts = yield* Ref.make(0);
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* project;
          yield* Command.runWith(command("/project"), { version: "0.3.0" })([
            "add",
            "banner.json",
          ]).pipe(Effect.exit);
          expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
          expect(yield* Ref.get(prompts)).toBe(
            answer === "noninteractive" ? 0 : 1
          );
        }).pipe(
          Effect.provide([
            layer,
            noProcesses,
            TestConsole.layer,
            terminalInput(
              answer === "noninteractive" ? "yes" : answer,
              Ref.update(prompts, (count) => count + 1)
            ),
            Stdio.layerTest({
              stdinIsTerminal: Effect.succeed(answer !== "noninteractive"),
              stdoutIsTerminal: Effect.succeed(answer !== "noninteractive"),
            }),
          ])
        );
      })
    );
  }
);

it.effect(
  "inspects an add-on without changing the project, then adds its files without creating composition state",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const before = yield* fs.readDirectory("/project");
        const inspection = yield* workspace.inspectAdd({
          reference: "banner.json",
        });
        expect(inspection.files).toEqual([
          { status: "create", target: "apps/web/banner.ts" },
        ]);
        expect(yield* fs.readDirectory("/project")).toEqual(before);
        yield* workspace.add({
          expected: inspection.precondition,
          overwrite: false,
          reference: "banner.json",
        });
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "export const banner = 'Campaign';\n"
        );
        expect(
          yield* fs.exists("/project/.workspace-composition.json")
        ).toBeFalsy();
        expect(
          yield* fs.exists("/project/.workspace-composition.lock")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "merges package-local requirements after native file installation and retries dependency reconciliation",
  () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const processes = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        packageManager(() =>
          Ref.update(attempts, (count) => count + 1).pipe(Effect.as(0))
        )
      );
      const layer = yield* memoryWorkspace("editorial", { processes });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* workspace.add({ overwrite: false, reference: "metrics.json" });
        const manifest = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.JsonObject)
        )(yield* fs.readFileString("/project/apps/web/package.json"));
        expect(manifest).toEqual({
          dependencies: { existing: "^1", "site-metrics": "^2" },
          name: "web",
          scripts: { report: "metrics report" },
        });
        yield* workspace.add({ overwrite: true, reference: "metrics.json" });
        expect(yield* Ref.get(attempts)).toBe(2);
        expect(
          yield* fs.exists("/project/.workspace-composition.json")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "inspects dependency replacements and requires explicit permission before changing them",
  () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const processes = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        packageManager(() =>
          Ref.update(attempts, (count) => count + 1).pipe(Effect.as(0))
        )
      );
      const layer = yield* memoryWorkspace("editorial", { processes });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* fs.makeDirectory("/project/apps/web", { recursive: true });
        const before =
          '{"name":"web","scripts":{"dev":"next dev"},"dependencies":{"site-metrics":"^1","existing":"^1"}}\n';
        yield* fs.writeFileString("/project/apps/web/package.json", before);
        const inspection = yield* workspace.inspectAdd({
          reference: "metrics-dependencies.json",
        });
        expect(inspection.packages).toEqual([
          {
            name: "site-metrics",
            section: "dependencies",
            status: "changed",
            target: "apps/web/package.json",
          },
        ]);
        const error = yield* workspace
          .add({ overwrite: false, reference: "metrics-dependencies.json" })
          .pipe(Effect.flip);
        expect(error._tag).toBe("AdditionConflict");
        expect({
          installations: yield* Ref.get(attempts),
          manifest: yield* fs.readFileString("/project/apps/web/package.json"),
        }).toEqual({ installations: 0, manifest: before });
        yield* workspace.add({
          expected: inspection.precondition,
          overwrite: true,
          reference: "metrics-dependencies.json",
        });
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.JsonObject))(
            yield* fs.readFileString("/project/apps/web/package.json")
          )
        ).toEqual({
          dependencies: { existing: "^1", "site-metrics": "^2" },
          name: "web",
          scripts: { dev: "next dev" },
        });
        expect(yield* Ref.get(attempts)).toBe(1);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "retains applied dependencies after a failed install and reconciles an explicit retry",
  () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const processes = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        packageManager(() =>
          Ref.updateAndGet(attempts, (count) => count + 1).pipe(
            Effect.map((count) => (count === 1 ? 1 : 0))
          )
        )
      );
      const layer = yield* memoryWorkspace("editorial", { processes });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* fs.makeDirectory("/project/apps/web", { recursive: true });
        yield* fs.writeFileString(
          "/project/apps/web/package.json",
          '{"name":"web"}\n'
        );
        const error = yield* workspace
          .add({ overwrite: false, reference: "metrics-dependencies.json" })
          .pipe(Effect.flip);
        expect(error._tag).toBe("DependencyInstallationFailed");
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.JsonObject))(
            yield* fs.readFileString("/project/apps/web/package.json")
          )
        ).toEqual({ dependencies: { "site-metrics": "^2" }, name: "web" });
        yield* workspace.add({
          overwrite: false,
          reference: "metrics-dependencies.json",
        });
        expect(yield* Ref.get(attempts)).toBe(2);
        expect(
          yield* fs.exists("/project/.workspace-composition.json")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "checks upstream root dependencies before installing and reconciles each accepted invocation",
  () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const processes = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        packageManager(() =>
          Ref.update(attempts, (count) => count + 1).pipe(Effect.as(0))
        )
      );
      const layer = yield* memoryWorkspace("editorial", { processes });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* fs.writeFileString(
          "/project/package.json",
          '{"dependencies":{"site-metrics":"^1"}}\n'
        );
        const error = yield* workspace
          .add({ overwrite: false, reference: "root-dependencies.json" })
          .pipe(Effect.flip);
        expect(error._tag).toBe("AdditionConflict");
        expect(yield* Ref.get(attempts)).toBe(0);
        yield* workspace.add({
          overwrite: true,
          reference: "root-dependencies.json",
        });
        yield* workspace.add({
          overwrite: true,
          reference: "root-dependencies.json",
        });
        expect(yield* Ref.get(attempts)).toBe(2);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects incompatible package requirements in the requested graph before native writes",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* fs.makeDirectory("/project/apps/web", { recursive: true });
        yield* fs.writeFileString(
          "/project/apps/web/package.json",
          '{"name":"web"}\n'
        );
        const error = yield* workspace
          .add({ overwrite: true, reference: "conflicting-metrics.json" })
          .pipe(Effect.flip);
        expect(error._tag).toBe("InvalidComposition");
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
        expect(yield* fs.readFileString("/project/apps/web/package.json")).toBe(
          '{"name":"web"}\n'
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "requires the installed provider and binds consumers to it without switching implementations",
  () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const processes = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        packageManager(() =>
          Ref.update(attempts, (count) => count + 1).pipe(Effect.as(0))
        )
      );
      const layer = yield* memoryWorkspace("editorial", { processes });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* fs.makeDirectory("/project/apps/web", { recursive: true });
        const other =
          '{"dependencies":{"@repo/auth":"workspace:@example/other-auth@*"}}\n';
        yield* fs.writeFileString("/project/apps/web/package.json", other);
        expect(
          yield* workspace
            .add({ overwrite: true, reference: "member-banner.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect({
          banner: yield* fs.exists("/project/apps/web/banner.ts"),
          installations: yield* Ref.get(attempts),
          manifest: yield* fs.readFileString("/project/apps/web/package.json"),
        }).toEqual({ banner: false, installations: 0, manifest: other });
        yield* fs.writeFileString(
          "/project/apps/web/package.json",
          '{"dependencies":{"@repo/auth":"workspace:@example/member-auth@*"}}\n'
        );
        const inspection = yield* workspace.inspectAdd({
          reference: "member-banner.json",
        });
        expect(inspection.assumptions).toHaveLength(1);
        yield* workspace.add({
          expected: inspection.precondition,
          overwrite: false,
          reference: "member-banner.json",
        });
        expect(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.JsonObject))(
            yield* fs.readFileString("/project/package.json")
          )
        ).toEqual({
          dependencies: { "@repo/auth": "workspace:@example/member-auth@*" },
          name: "application",
          private: true,
        });
        expect({
          banner: yield* fs.exists("/project/apps/web/banner.ts"),
          installations: yield* Ref.get(attempts),
        }).toEqual({ banner: true, installations: 1 });
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "reports partial native installation without deleting applied project files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial", {
        fileSystem: (fs) => ({
          ...fs,
          writeFileString: (target, content, options) =>
            fs.writeFileString(target, content, options).pipe(
              Effect.andThen(
                target === "/project/apps/web/banner.ts"
                  ? Effect.fail(
                      PlatformError.systemError({
                        _tag: "Unknown",
                        method: "writeFileString",
                        module: "FileSystem",
                        pathOrDescriptor: target,
                      })
                    )
                  : Effect.void
              )
            ),
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const error = yield* workspace
          .add({ overwrite: false, reference: "banner.json" })
          .pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "AdditionFailed",
          phase: "registry",
        });
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "export const banner = 'Campaign';\n"
        );
        expect(yield* fs.exists("/project/package.json")).toBeTruthy();
        expect(
          yield* fs.exists("/project/.workspace-composition.json")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects a native dependency that disagrees with a root package requirement before changing files",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const before = yield* fs.readFileString("/project/package.json");
        expect(
          yield* workspace
            .add({ overwrite: true, reference: "conflicting-root.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.exists("/project/apps/web/banner.ts")).toBeFalsy();
        expect(yield* fs.readFileString("/project/package.json")).toBe(before);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "rejects a project edit made after inspection even when overwriting was approved",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        const inspection = yield* workspace.inspectAdd({
          reference: "banner.json",
        });
        yield* fs.makeDirectory("/project/apps/web", { recursive: true });
        yield* fs.writeFileString("/project/apps/web/banner.ts", "Local work");
        const error = yield* workspace
          .add({
            expected: inspection.precondition,
            overwrite: true,
            reference: "banner.json",
          })
          .pipe(Effect.flip);
        expect(error._tag).toBe("AdditionChanged");
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "Local work"
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "adds files without requiring private coordination directories in the project",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("editorial", {
        fileSystem: (fs) => ({
          ...fs,
          makeDirectory: (directory, options) =>
            directory.startsWith("/project/.")
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    method: "makeDirectory",
                    module: "FileSystem",
                    pathOrDescriptor: directory,
                  })
                )
              : fs.makeDirectory(directory, options),
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* project;
        yield* workspace.add({ overwrite: false, reference: "banner.json" });
        expect(yield* fs.readFileString("/project/apps/web/banner.ts")).toBe(
          "export const banner = 'Campaign';\n"
        );
      }).pipe(Effect.provide(layer));
    })
);
