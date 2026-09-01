import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parse } from "jsonc-parser";
import { afterEach, describe, expect, it } from "vitest";

import type {
  TypeScriptPathAlias,
  TypeScriptPathAliasTarget,
} from "../src/composition/types.js";
import {
  applyTypeScriptPathAliases,
  checkTypeScriptPathAliases,
} from "../src/composition/typescript-paths.js";

const temporaryDirectories: string[] = [];

const workspaceFixture = async (): Promise<string> => {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "next-hydra-typescript-paths-")
  );
  temporaryDirectories.push(workspace);
  await mkdir(path.join(workspace, "apps/web"), { recursive: true });
  await mkdir(path.join(workspace, "packages/cms-contentstack"), {
    recursive: true,
  });
  await writeFile(
    path.join(workspace, "apps/web/tsconfig.json"),
    `{
  // Existing project comments must survive composition.
  "compilerOptions": {
    "paths": {
      "@repo/existing": ["../../packages/existing"],
      "@repo/cms": ["../../packages/not-contentstack"],
      "@repo/cms/*": ["../../packages/not-contentstack/*"],
      "@repo/commerce-provider": ["../../packages/old-commerce"],
      "@repo/commerce-provider/*": ["../../packages/old-commerce/*"],
      "@repo/*": ["../../packages/*"]
    }
  }
}
`
  );
  return workspace;
};

const requirements: TypeScriptPathAlias[] = [
  {
    alias: "@repo/cms",
    cwd: "apps/web",
    sourcePath: "packages/cms-contentstack",
  },
];

const catalogRequirements: TypeScriptPathAliasTarget[] = [
  ...requirements,
  {
    alias: "@repo/commerce-provider",
    cwd: "apps/web",
  },
  {
    alias: "@repo/cms",
    cwd: "apps/removed-provider-consumer",
  },
];

const plan = {
  catalogTypeScriptPathAliases: catalogRequirements,
  typeScriptPathAliases: requirements,
};

describe("TypeScript provider paths", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("writes direct-source aliases without losing local paths or JSONC", async () => {
    const workspace = await workspaceFixture();
    const configPath = path.join(workspace, "apps/web/tsconfig.json");

    await applyTypeScriptPathAliases(workspace, plan);
    const firstWrite = await readFile(configPath, "utf-8");

    expect(firstWrite).toContain(
      "// Existing project comments must survive composition."
    );
    expect(firstWrite).not.toContain('"@repo/commerce-provider"');
    expect(parse(firstWrite)).toMatchObject({
      compilerOptions: {
        paths: {
          "@repo/*": ["../../packages/*"],
          "@repo/cms": ["../../packages/cms-contentstack"],
          "@repo/cms/*": ["../../packages/cms-contentstack/*"],
          "@repo/existing": ["../../packages/existing"],
        },
      },
    });
    await applyTypeScriptPathAliases(workspace, plan);
    await expect(readFile(configPath, "utf-8")).resolves.toBe(firstWrite);
  });

  it("reports independently seeded path drift", async () => {
    const workspace = await workspaceFixture();

    await expect(
      checkTypeScriptPathAliases(workspace, plan)
    ).resolves.toStrictEqual([
      'apps/web/tsconfig.json: expected compilerOptions.paths.@repo/cms to be ["../../packages/cms-contentstack"]',
      'apps/web/tsconfig.json: expected compilerOptions.paths.@repo/cms/* to be ["../../packages/cms-contentstack/*"]',
      'apps/web/tsconfig.json: expected compilerOptions.paths.@repo/commerce-provider to be absent, found ["../../packages/old-commerce"]',
      'apps/web/tsconfig.json: expected compilerOptions.paths.@repo/commerce-provider/* to be absent, found ["../../packages/old-commerce/*"]',
    ]);
  });
});
