#!/usr/bin/env node

import { cancel } from "@clack/prompts";

import { runCli } from "./index.js";
import { UserCancelledError } from "./prompts.js";

async function main() {
  try {
    await runCli(process.argv);
  } catch (error) {
    if (error instanceof UserCancelledError) {
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    cancel(message);
    process.exitCode = 1;
  }
}

main();
