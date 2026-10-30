import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

describe("deployment tooling installation", () => {
  it("repairs an incompatible restored store before installing deployment tooling", () => {
    const repository = path.resolve(import.meta.dirname, "../../..");
    const root = mkdtempSync(path.join(tmpdir(), "tooling-install-"));
    const environment: NodeJS.ProcessEnv = {
      CI: "true",
      HOME: process.env.HOME,
      NODE_ENV: "test",
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR,
    };
    const run = (command: string, args: string[], store: string) => {
      const env: NodeJS.ProcessEnv = {
        ...environment,
        PNPM_CONFIG_STORE_DIR: path.join(root, store),
      };
      return spawnSync(command, args, {
        cwd: root,
        encoding: "utf-8",
        env,
        timeout: 30_000,
      });
    };
    const write = (file: string, content: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    };
    try {
      write(
        "artifact/package/package.json",
        '{"name":"fixture-dependency","version":"1.0.0","main":"index.cjs"}'
      );
      write("artifact/package/index.cjs", 'module.exports = "installed";');
      assert.equal(
        run(
          "tar",
          ["-czf", "dependency.tgz", "-C", "artifact", "package"],
          "old-store"
        ).status,
        0
      );
      write("pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n");
      write(
        "package.json",
        '{"name":"next-hydra","private":true,"devDependencies":{"@repo/typescript-config":"workspace:*","fixture-dependency":"file:./dependency.tgz"}}'
      );
      write(
        "packages/create-next-hydra/package.json",
        '{"name":"create-next-hydra","private":true,"dependencies":{"@repo/typescript-config":"workspace:*"}}'
      );
      write(
        "packages/typescript-config/package.json",
        '{"name":"@repo/typescript-config","private":true}'
      );
      write(
        "apps/unselected/package.json",
        '{"name":"unselected-app","private":true,"dependencies":{"fixture-dependency":"file:../../dependency.tgz"}}'
      );
      const initial = run("pnpm", ["install", "--ignore-scripts"], "old-store");
      assert.equal(initial.status, 0, initial.stdout + initial.stderr);
      const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf-8");
      const helper = "scripts/install-composition-tooling.ts";
      mkdirSync(path.join(root, "scripts"));
      cpSync(path.join(repository, helper), path.join(root, helper));
      const configuration = Schema.decodeSync(
        Schema.fromJsonString(Schema.Struct({ installCommand: Schema.String }))
      )(
        readFileSync(
          path.join(
            repository,
            "workspaces/storefront-contentstack/apps/web/vercel.json"
          ),
          "utf-8"
        )
      );
      const [, command] = configuration.installCommand.split(" && ");
      assert.ok(command);
      const install = () => run("sh", ["-c", command], "new-store");
      const recovered = install();
      assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
      const application = run(
        process.execPath,
        [
          "-e",
          'console.log(require("./apps/unselected/node_modules/fixture-dependency"))',
        ],
        "new-store"
      );
      expect(application.stdout.trim()).toBe("installed");
      const repeated = install();
      expect({
        changedLock:
          readFileSync(path.join(root, "pnpm-lock.yaml"), "utf-8") !== lockfile,
        retried: repeated.stderr.includes("Retrying a full frozen install"),
        status: repeated.status,
      }).toEqual({ changedLock: false, retried: false, status: 0 });
      const manifest = readFileSync(path.join(root, "package.json"), "utf-8");
      write("package.json", manifest.replace("file:./dependency.tgz", "9.9.9"));
      const outdated = install();
      expect({
        retried: outdated.stderr.includes("Retrying a full frozen install"),
        status: outdated.status,
      }).toEqual({ retried: false, status: 1 });
      expect(outdated.stdout + outdated.stderr).toContain(
        "ERR_PNPM_OUTDATED_LOCKFILE"
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
