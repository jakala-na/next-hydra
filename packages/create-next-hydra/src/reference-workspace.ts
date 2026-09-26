import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ApplicationTaskFailed, InvalidComposition } from "./errors.ts";
import { WorkspaceDefinition } from "./model.ts";
import { ManifestJson } from "./packages.ts";
import {
  referenceBindings,
  REFERENCE_PROVIDERS,
  REFERENCE_WORKSPACE_NAME,
} from "./reference-workspace-bindings.ts";
import { Workspaces } from "./workspaces.ts";

export const testReferenceWorkspace = Effect.fn("WorkspaceTasks.testReference")(
  function* (sourceRoot: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.join(
      sourceRoot,
      "workspaces",
      REFERENCE_WORKSPACE_NAME
    );
    const definition = yield* fs
      .readFileString(path.join(directory, "next-hydra.json"))
      .pipe(
        Effect.flatMap(
          Schema.decodeEffect(Schema.fromJsonString(WorkspaceDefinition))
        )
      );
    if (
      (["auth", "cms", "commerce"] as const).some(
        (slot) => definition.providers[slot] !== REFERENCE_PROVIDERS[slot]
      )
    ) {
      return yield* new InvalidComposition({
        message:
          "Application tests require the reference storefront definition with WorkOS, Contentstack and commercetools.",
      });
    }
    const workspace = yield* (yield* Workspaces).named({
      name: REFERENCE_WORKSPACE_NAME,
      sourceRoot,
    });
    const result = yield* workspace.sync({});
    if (result.dependencies !== "current") {
      return yield* new InvalidComposition({
        message: "Reference workspace dependencies are not current.",
      });
    }
    for (const { app, alias, provider } of referenceBindings) {
      const appRoot = path.join(directory, "apps", app);
      const manifest = yield* fs
        .readFileString(path.join(appRoot, "package.json"))
        .pipe(Effect.flatMap(Schema.decodeEffect(ManifestJson)));
      if (
        manifest.dependencies?.[alias] !== `workspace:@repo/${provider}@*` ||
        (yield* fs.realPath(path.join(appRoot, "node_modules", alias))) !==
          (yield* fs.realPath(path.join(directory, "packages", provider)))
      ) {
        return yield* new InvalidComposition({
          message: `${app}'s ${alias} must resolve to ${provider} inside ${REFERENCE_WORKSPACE_NAME}. Refresh and reinstall it before testing.`,
        });
      }
    }
    yield* Console.log(`Application tests: ${REFERENCE_WORKSPACE_NAME}`);
    const process = yield* ChildProcessSpawner.ChildProcessSpawner;
    const code = yield* process.exitCode(
      ChildProcess.make(
        "pnpm",
        [
          "exec",
          "turbo",
          "run",
          "test",
          "--filter=./apps/*",
          "--only",
          "--continue=always",
        ],
        {
          cwd: directory,
          stderr: "inherit",
          stdin: "inherit",
          stdout: "inherit",
        }
      )
    );
    if (code !== 0) {
      return yield* new ApplicationTaskFailed({ code, directory });
    }
  }
);
