// oxlint-disable-next-line effecttsgo/node-builtin-import -- This repository guard intentionally uses the Node filesystem directly.
import { existsSync, readFileSync, readdirSync } from "node:fs";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- This repository guard intentionally uses the Node path API directly.
import path from "node:path";

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

interface TestEnvironmentViolation {
  readonly command: string;
  readonly manifest: string;
  readonly script: string;
}

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const workspaceDirectories = ["apps", "packages", "tests"] as const;
const vitestCommand = /\bvitest\b/u;
const testEnvironmentPrefix = "NODE_ENV=test ";

const packageManifests = [
  "package.json",
  ...workspaceDirectories.flatMap((directory) =>
    readdirSync(path.join(workspaceRoot, directory), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name, "package.json"))
      .filter((manifest) => existsSync(path.join(workspaceRoot, manifest)))
  ),
];
// This sorts a fresh array assembled only for the checker; no caller-owned input is mutated.
// oxlint-disable-next-line unicorn/no-array-sort
packageManifests.sort((left, right) => left.localeCompare(right));

const violations = packageManifests.flatMap((manifest) => {
  const contents = readFileSync(path.join(workspaceRoot, manifest), "utf-8");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: pnpm requires package manifests to be JSON objects with string-valued scripts before this repository guard runs.
  const { scripts } = JSON.parse(contents) as PackageManifest;

  return Object.entries(scripts ?? {}).flatMap(
    ([script, command]): readonly TestEnvironmentViolation[] => {
      if (
        !vitestCommand.test(command) ||
        command.startsWith(testEnvironmentPrefix)
      ) {
        return [];
      }

      return [{ command, manifest, script }];
    }
  );
});

if (violations.length > 0) {
  process.stderr.write(
    "Direct Vitest commands must set NODE_ENV=test before Vitest so production build environments cannot select production-only runtime behavior.\n"
  );
  for (const violation of violations) {
    process.stderr.write(
      `- ${violation.manifest} scripts.${violation.script}: ${violation.command}\n`
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `All direct Vitest commands in ${packageManifests.length} package manifests set NODE_ENV=test.\n`
  );
}
