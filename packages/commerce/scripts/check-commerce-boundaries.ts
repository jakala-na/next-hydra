import { execFileSync } from "node:child_process";
import path from "node:path";

import { checkCommerceBoundaries } from "./commerce-boundaries.ts";

const commerceRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(commerceRoot, "../..");

execFileSync(
  "pnpm",
  [
    "exec",
    "oxlint",
    "--allow",
    "correctness",
    "--config",
    "oxlint.boundaries.config.ts",
    "apps",
    "packages",
  ],
  { cwd: repoRoot, stdio: "inherit" }
);

const violations = checkCommerceBoundaries(repoRoot);

if (violations.length > 0) {
  process.stderr.write(
    `${violations.map((violation) => `- ${violation}`).join("\n")}\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write("Commerce provider boundaries are valid\n");
}
