import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { workspaceEnvironment } from "./environment.ts";

// Consume the executable and real application sources, not private constructor
// functions or an expected inventory of provider files.
const run = Effect.fn("scaffoldE2E.run")(function* (
  cwd: string,
  executable: string,
  args: readonly string[],
  nodeEnv: "test" | "production" = "test"
) {
  const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* processes.spawn(
    ChildProcess.make(executable, args, {
      cwd,
      env: workspaceEnvironment(nodeEnv),
      extendEnv: false,
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    })
  );
  const [code, stdout, stderr] = yield* Effect.all(
    [
      child.exitCode,
      Stream.mkString(Stream.decodeText(child.stdout)),
      Stream.mkString(Stream.decodeText(child.stderr)),
    ],
    { concurrency: "unbounded" }
  );
  if (code !== 0) {
    return yield* Effect.die(
      new Error(
        `${executable} ${args.join(" ")} exited ${code}\n${stdout}\n${stderr}`
      )
    );
  }
  return stdout;
});

// Snapshot Git-visible source into a disposable repository so creation uses its
// real Git acquisition boundary, including current uncommitted changes.
// Ignored credentials and local materialized applications are not copied.
const sourceRepository = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const checkout = path.resolve(import.meta.dirname, "../../../..");
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "scaffold-e2e-" });
  const source = path.join(root, "source");
  yield* fs.makeDirectory(source);
  const files = yield* run(checkout, "git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  yield* Effect.forEach(
    new Set(files.split("\0").filter(Boolean)),
    (relative) =>
      Effect.gen(function* () {
        const original = path.join(checkout, relative);
        if (!(yield* fs.exists(original))) {
          return;
        }
        const target = path.join(source, relative);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.copyFile(original, target);
      }),
    { concurrency: 16 }
  );
  yield* run(source, "git", ["init", "-q"]);
  yield* run(source, "git", ["add", "."]);
  yield* run(source, "git", [
    "-c",
    "user.name=Scaffold Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "-qm",
    "Application source",
  ]);
  return {
    cli: path.join(checkout, "packages/create-next-hydra/dist/cli.js"),
    source,
    target: path.join(root, "application"),
  };
});

const scaffold = (cms: string, auth?: string) =>
  Effect.gen(function* () {
    const { cli, source, target } = yield* sourceRepository;
    yield* run(source, process.execPath, [
      cli,
      target,
      "--repo-url",
      ".",
      "--yes",
      "--skip-git",
      "--cms",
      cms,
      ...(auth
        ? ["--auth", auth, "--commerce", "commercetools"]
        : ["--without", "auth", "--without", "commerce"]),
    ]);
    return target;
  });

for (const cms of ["contentstack", "drupal"]) {
  it.live(
    `installs and typechecks a standalone ${cms} CMS site and runs its documented administration command`,
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const target = yield* scaffold(cms);
        yield* run(target, "pnpm", ["run", "typecheck", "--continue=always"]);
        const readme = yield* fs.readFileString(
          path.join(target, "apps/cli/README.md")
        );
        const command = readme
          .split("\n")
          .find((line) => line.startsWith("pnpm ") && line.endsWith(" --help"));
        if (!command) {
          return yield* Effect.die(
            "The installed administration README must document a help command."
          );
        }
        expect(
          (yield* run(target, "pnpm", command.split(" ").slice(1))).trim()
        ).not.toBe("");
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 600_000 }
  );
}

for (const { cms, auth } of [
  { auth: "workos", cms: "contentstack" },
  { auth: "workos", cms: "drupal" },
  { auth: "clerk", cms: "contentstack" },
]) {
  it.live(
    `installs and validates the ${cms}/${auth} storefront as an independent project`,
    () =>
      Effect.gen(function* () {
        const target = yield* scaffold(cms, auth);
        yield* cms === "contentstack" && auth === "workos"
          ? run(
              target,
              "pnpm",
              ["run", "build", "--force", "--output-logs=errors-only"],
              "production"
            )
          : run(target, "pnpm", ["run", "typecheck", "--continue=always"]);
        // Exercise invitation behavior through the composed API/provider seam.
        expect(
          (yield* run(target, "pnpm", [
            "--filter",
            "api",
            "exec",
            "vitest",
            "run",
            "lib/company-member-invitation-composition.test.ts",
          ])).trim()
        ).not.toBe("");
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 600_000 }
  );
}
