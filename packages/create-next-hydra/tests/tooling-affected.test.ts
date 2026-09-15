import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { git } from "../scripts/deployment-git.mts";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");
const cliDirectory = "packages/create-next-hydra";
const turbo = path.join(sourceRoot, "node_modules/turbo/bin/turbo");
const affectedSchema = z.object({
  data: z.object({
    affectedTasks: z.object({
      items: z.array(z.object({ fullName: z.string() })),
    }),
  }),
});

describe("composition tooling task inputs", () => {
  let root: string;
  let base: string;

  async function write(file: string, content: string) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }

  function commit() {
    git(root, ["add", "--all"]);
    git(root, [
      "-c",
      "user.name=Composition Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      "fixture input change",
    ]);
    return git(root, ["rev-parse", "HEAD"]).trim();
  }

  function affected() {
    const output = execFileSync(
      process.execPath,
      [
        turbo,
        "query",
        "affected",
        "--tasks",
        "build",
        "typecheck",
        "--packages",
        "create-next-hydra",
        "--base",
        base,
        "--head",
        "HEAD",
      ],
      {
        cwd: root,
        encoding: "utf-8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH,
          TURBO_TELEMETRY_DISABLED: "1",
        },
      }
    );
    return affectedSchema
      .parse(JSON.parse(output))
      .data.affectedTasks.items.map((item) => item.fullName);
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "tooling-affected-"));
    git(root, ["init", "--quiet", "--initial-branch=main"]);
    await write(
      "package.json",
      '{"private":true,"packageManager":"pnpm@10.11.0"}'
    );
    await write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    await write(
      "pnpm-lock.yaml",
      "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  packages/create-next-hydra: {}\n"
    );
    const rootConfiguration = z
      .object({ futureFlags: z.record(z.boolean()) })
      .parse(
        JSON.parse(await readFile(path.join(sourceRoot, "turbo.json"), "utf-8"))
      );
    await write(
      "turbo.json",
      JSON.stringify({
        futureFlags: rootConfiguration.futureFlags,
        tasks: { build: {}, typecheck: {} },
      })
    );
    await write(
      `${cliDirectory}/package.json`,
      '{"name":"create-next-hydra","scripts":{"build":"tsc","typecheck":"tsc --noEmit"}}'
    );
    await copyFile(
      path.join(sourceRoot, cliDirectory, "turbo.json"),
      path.join(root, cliDirectory, "turbo.json")
    );
    await write(`${cliDirectory}/src/index.ts`, "export const version = 1;");
    await write(`${cliDirectory}/tests/example.test.ts`, "initial test");
    await write("packages/typescript-config/base.json", "{}");
    base = commit();
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("does not select CLI compilation or typechecking for a maintainer-test-only edit", async () => {
    await write(`${cliDirectory}/tests/example.test.ts`, "longer timeout");
    commit();
    expect(affected()).toEqual([]);
  });

  it.each([
    `${cliDirectory}/src/new-module.ts`,
    "packages/typescript-config/base.json",
  ])("selects both tasks when their actual input changes: %s", async (file) => {
    await write(file, "changed compiler input");
    commit();
    expect(affected()).toEqual(
      expect.arrayContaining([
        "create-next-hydra#build",
        "create-next-hydra#typecheck",
      ])
    );
  });

  it("selects compilation when the dist cleanup implementation changes", async () => {
    await write(`${cliDirectory}/scripts/clean-dist.js`, "changed cleanup");
    commit();
    expect(affected()).toContain("create-next-hydra#build");
  });
});
