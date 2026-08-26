#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const repoRoot = path.resolve(__dirname, "..");
const packageDir = path.join(repoRoot, "packages", "create-next-hydra");
const packageJsonPath = path.join(packageDir, "package.json");

function hasFlag(name) {
  return process.argv.includes(name);
}

function printHelp() {
  console.log(`Usage: node scripts/release-create-next-hydra.mjs [options]

Options:
  --dry-run       Run npm publish in dry-run mode
  --allow-dirty   Allow a dirty worktree during a dry run
  --help          Show this help message
`);
}

async function run(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`Command failed (${code}): ${command} ${args.join(" ")}`)
      );
    });
  });
}

async function getPackageInfo() {
  const raw = await readFile(packageJsonPath, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    name: parsed.name,
    version: parsed.version,
  };
}

async function ensureCleanWorktree() {
  let output = "";

  await new Promise((resolve, reject) => {
    const child = spawn("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });

    child.stderr.on("data", () => {
      // ignore; command failure is handled on close/error
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error("Failed to inspect git status."));
    });
  });

  if (output.trim()) {
    throw new Error(
      "Refusing to release from a dirty worktree. Commit/stash changes, or use --dry-run --allow-dirty for local testing."
    );
  }
}

async function main() {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const dryRun = hasFlag("--dry-run");
  const allowDirty = hasFlag("--allow-dirty");

  if (allowDirty && !dryRun) {
    throw new Error("`--allow-dirty` can only be used with `--dry-run`.");
  }

  if (!allowDirty) {
    await ensureCleanWorktree();
  }

  const before = await getPackageInfo();
  console.log(
    `Releasing ${before.name}@${before.version}${dryRun ? " (dry-run)" : ""}`
  );

  console.log(`\n==> Building ${before.name}@${before.version}`);
  await run("pnpm", ["--filter", "create-next-hydra", "build"], {
    cwd: repoRoot,
  });

  console.log(`\n==> Packing ${before.name}@${before.version}`);
  await run("npm", ["pack"], { cwd: packageDir });

  if (dryRun) {
    console.log(
      `\n==> npm publish --dry-run (${before.name}@${before.version})`
    );
    await run("npm", ["publish", "--access", "public", "--dry-run"], {
      cwd: packageDir,
    });
    return;
  }

  console.log(`\n==> Publishing ${before.name}@${before.version}`);
  await run("npm", ["publish", "--access", "public"], { cwd: packageDir });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`\nRelease failed: ${message}`);
  process.exitCode = 1;
});
