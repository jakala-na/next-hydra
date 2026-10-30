#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const storeError = "ERR_PNPM_UNEXPECTED_STORE";

async function install(args: readonly string[]) {
  const child = spawn("pnpm", args, {
    cwd: root,
    stdio: ["inherit", "inherit", "pipe"],
  });
  let unexpectedStore = false;
  let tail = "";
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    const diagnostic = tail + String(chunk);
    unexpectedStore ||= diagnostic.includes(storeError);
    tail = diagnostic.slice(-storeError.length);
  });
  await once(child, "close");
  return { code: child.exitCode, unexpectedStore };
}

const result = await install([
  "--filter",
  "next-hydra...",
  "--filter",
  "create-next-hydra...",
  "install",
  "--frozen-lockfile",
]);

if (result.code !== null && result.code !== 0 && result.unexpectedStore) {
  // pnpm cannot replace a restored workspace's store during a filtered install.
  // Let its full installer rebuild dependency links without deleting caches here.
  process.stderr.write(
    "Retrying a full frozen install to reconcile the restored pnpm store.\n"
  );
  const recovered = await install(["install", "--frozen-lockfile"]);
  process.exitCode = recovered.code ?? 1;
} else {
  process.exitCode = result.code ?? 1;
}
