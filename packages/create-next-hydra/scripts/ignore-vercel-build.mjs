/// <reference types="node" />
// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { workspaceTaskManifest } from "../src/workspace-task-manifest.ts";
import { git } from "./deployment-git.mts";

const turboVersion = "2.10.13";

function ignoreBuild() {
  if (process.env.VERCEL_FORCE_BUILD === "1") {
    return { reason: "Forced deployment requested.", skip: false };
  }
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  if (git(root, ["log", "-1", "--pretty=%B"]).includes("[skip ci]")) {
    return { reason: "Commit requests [skip ci].", skip: true };
  }
  const relative = path.relative(root, process.cwd()).split(path.sep).join("/");
  const name = /^workspaces\/(?<name>[^/]+)\/apps\/[^/]+$/u.exec(relative)
    ?.groups?.name;
  assert.ok(name, "Not a named workspace application");
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  if (!base || !/^[a-f0-9]{40}$/u.test(base) || base === head) {
    return {
      reason:
        "No distinct successful deployment; allowing initialization or redeploy.",
      skip: false,
    };
  }
  git(root, ["cat-file", "-e", `${base}^{commit}`]);
  git(root, ["merge-base", "--is-ancestor", base, head]);

  const directory = `workspaces/${name}/tasks`;
  for (const file of ["package.json", "turbo.json"]) {
    const relativeFile = `${directory}/${file}`;
    git(root, ["cat-file", "-e", `HEAD:${relativeFile}`]);
    assert.ok(lstatSync(path.join(root, relativeFile)).isFile());
  }
  // Do not interpret a missing task or externally owned sources as "unaffected".
  assert.deepStrictEqual(
    JSON.parse(
      readFileSync(path.join(root, directory, "package.json"), "utf-8")
    ),
    workspaceTaskManifest(name)
  );
  assert.partialDeepStrictEqual(
    JSON.parse(readFileSync(path.join(root, directory, "turbo.json"), "utf-8")),
    {
      extends: ["//"],
      tasks: {
        build: {
          cache: false,
          dependsOn: ["^build"],
          inputs: [`$TURBO_ROOT$/workspaces/${name}/next-hydra.json`],
        },
      },
    }
  );
  const version = spawnSync("turbo", ["--version"], {
    cwd: root,
    encoding: "utf-8",
    timeout: 10_000,
  });
  const installed =
    version.status === 0 && version.stdout.trim() === turboVersion;
  /** @param {string[]} arguments_ Arguments for the pinned Turbo executable. */
  function execute(arguments_) {
    return spawnSync(
      installed ? "turbo" : "npx",
      installed
        ? arguments_
        : ["--yes", `turbo@${turboVersion}`, ...arguments_],
      { cwd: root, encoding: "utf-8", timeout: 60_000 }
    );
  }
  // An unknown --packages filter returns an empty result. Verify graph membership first.
  const discovered = execute([
    "query",
    `{ package(name: "@workspaces/${name}") { name } }`,
  ]);
  assert.equal(discovered.status, 0);
  assert.deepStrictEqual(JSON.parse(discovered.stdout), {
    data: { package: { name: `@workspaces/${name}` } },
  });
  const args = [
    "query",
    "affected",
    "--tasks",
    "build",
    "--packages",
    `@workspaces/${name}`,
    "--base",
    base,
    "--head",
    head,
    "--exit-code",
  ];
  const result = execute(args);
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    return { reason: "Turbo could not establish affected tasks.", skip: false };
  }
  return {
    reason:
      result.status === 0
        ? `Turbo found no affected build for ${name}.`
        : `Turbo found an affected build for ${name}.`,
    skip: result.status === 0,
  };
}

try {
  const result = ignoreBuild();
  process.stdout.write(
    `${result.skip ? "Skipping" : "Building"}: ${result.reason}\n`
  );
  process.exitCode = result.skip ? 0 : 1;
} catch {
  process.stdout.write(
    "Building: unable to establish a safe Turbo comparison.\n"
  );
  process.exitCode = 1;
}
