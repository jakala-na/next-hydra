#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { text } from "node:stream/consumers";

import packageInfo from "../packages/create-next-hydra/package.json" with { type: "json" };

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageDir = path.join(repoRoot, "packages", "create-next-hydra");

/** @param {string} name - The command-line flag to inspect. */
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

/**
 * @param {string} command - Executable to run without a shell.
 * @param {string[]} args - Arguments passed to the executable.
 * @param {{ cwd?: string }} options - Optional working-directory override.
 */
async function run(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  await once(child, "close");
  if (child.exitCode !== 0) {
    throw new Error(
      `Command failed (${child.exitCode ?? child.signalCode}): ${command} ${args.join(" ")}`
    );
  }
}

async function ensureCleanWorktree() {
  const child = spawn("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const [output] = await Promise.all([
    text(child.stdout),
    once(child, "close"),
  ]);
  if (child.exitCode !== 0) {
    throw new Error("Failed to inspect git status.");
  }

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

  const before = packageInfo;
  console.log(
    `Releasing ${before.name}@${before.version}${dryRun ? " (dry-run)" : ""}`
  );

  console.log(`\n==> Building ${before.name}@${before.version}`);
  await run("pnpm", ["--filter", "create-next-hydra", "build"], {
    cwd: repoRoot,
  });

  console.log(`\n==> Packing ${before.name}@${before.version}`);
  const tarball = path.join(packageDir, `${before.name}-${before.version}.tgz`);
  await run("pnpm", ["pack", "--out", tarball], { cwd: packageDir });

  if (dryRun) {
    console.log(
      `\n==> npm publish --dry-run (${before.name}@${before.version})`
    );
    await run("npm", ["publish", tarball, "--access", "public", "--dry-run"], {
      cwd: packageDir,
    });
    return;
  }

  console.log(`\n==> Publishing ${before.name}@${before.version}`);
  await run("npm", ["publish", tarball, "--access", "public"], {
    cwd: packageDir,
  });
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`\nRelease failed: ${message}`);
  process.exitCode = 1;
}
