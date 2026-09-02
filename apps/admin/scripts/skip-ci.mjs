/// <reference types="node" />
// @ts-check

import { execFileSync } from "node:child_process";

const commitMessage = execFileSync("git", ["log", "-1", "--pretty=%B"], {
  encoding: "utf-8",
}).trim();

if (commitMessage.includes("[skip ci]")) {
  process.stdout.write("Skipping build due to [skip ci] in commit message.\n");
  process.exit(0);
}

process.exit(1);
