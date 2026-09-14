/// <reference types="node" />
// @ts-check

import { execFileSync } from "node:child_process";

// Runs before installation. No dependency on the materialized app or its dependency graph.
const message = execFileSync("git", ["log", "-1", "--pretty=%B"], {
  encoding: "utf-8",
});
if (message.includes("[skip ci]")) {
  process.stdout.write("Skipping build due to [skip ci] in commit message.\n");
  process.exit(0);
}
process.exit(1);
