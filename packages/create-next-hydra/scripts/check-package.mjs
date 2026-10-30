import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

// Resolve dependencies outside the monorepo: its lockfile can conceal a broken
// published dependency range even when source tests and builds pass.
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 180_000,
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`
  );
  return result.stdout;
};

const scratch = await mkdtemp(
  path.join(tmpdir(), "create-next-hydra-package-")
);
try {
  const [providedTarball] = process.argv.slice(2);
  const tarball = providedTarball
    ? path.resolve(providedTarball)
    : path.join(scratch, "package.tgz");
  if (!providedTarball) {
    run("pnpm", ["pack", "--out", tarball], packageRoot);
  }
  const consumer = path.join(scratch, "consumer");
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" })
  );
  run("pnpm", ["add", "--prod", "--ignore-scripts", tarball], consumer);
  assert.equal(
    run("pnpm", ["exec", "create-next-hydra", "--version"], consumer).trim(),
    `${manifest.name} v${manifest.version}`
  );
  assert.match(
    run("pnpm", ["exec", "create-next-hydra", "--help"], consumer),
    /compose/u
  );
  run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import assert from "node:assert/strict"; import { cliProgram, runCli } from "create-next-hydra"; assert.equal(typeof cliProgram, "function"); assert.equal(typeof runCli, "function");',
    ],
    consumer
  );

  const source = path.join(scratch, "source");
  await cp(new URL("../tests/examples/compiled/", import.meta.url), source, {
    recursive: true,
  });
  run("git", ["init", "-q"], source);
  const cli = path.join(consumer, "node_modules/create-next-hydra/dist/cli.js");
  run(
    process.execPath,
    [cli, "compose", "example-site", "--no-install"],
    source
  );
  assert.match(
    await readFile(
      path.join(source, "workspaces/example-site/apps/web/article.ts"),
      "utf8"
    ),
    /An authored article/u
  );
  run(process.execPath, [cli, "compose", "example-site", "--check"], source);
  console.log(
    `Packed ${manifest.name}@${manifest.version} starts, imports, composes, and passes Check with fresh dependencies.`
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
