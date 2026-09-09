import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { CompositionPlan } from "../src/composition/types.js";
import {
  applyPackageEntries,
  applyPackageRequirements,
} from "../src/composition/workspace.js";
import { readJsonFile } from "../src/fs-utils.js";

const temporaryDirectories: string[] = [];

async function packageFixture(source: string): Promise<{
  manifestPath: string;
  workspaceRoot: string;
}> {
  const workspaceRoot = await mkdtemp(
    path.join(tmpdir(), "next-hydra-packages-")
  );
  temporaryDirectories.push(workspaceRoot);
  const manifestPath = path.join(workspaceRoot, "apps/web/package.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, source);
  return { manifestPath, workspaceRoot };
}

function removalPlan(): CompositionPlan {
  return {
    assets: [],
    catalogManagedTargets: [],
    catalogPackageRequirementTargets: [
      {
        cwd: "apps/web",
        name: "remove-me",
        section: "dependencies",
      },
    ],
    catalogPnpmPatches: [],
    catalogTypeScriptPathAliases: [],
    entryItems: [],
    instructions: [],
    maintainerCopyTargets: [],
    managedTargets: [],
    packageRequirements: [],
    pnpmPatches: [],
    registryItems: [],
    selection: {
      addOns: [],
      providers: {
        auth: "workos",
        cms: "contentstack",
        commerce: "commercetools",
      },
    },
    selections: [],
    templates: [],
    typeScriptPathAliases: [],
    variableTargets: [],
  };
}

describe("package manifest updates", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("validates JSON at the read boundary without dropping unrelated fields", async () => {
    const { manifestPath } = await packageFixture(
      '{"name":"example","custom":true}'
    );
    const schema = z.object({ name: z.string() }).passthrough();
    await expect(readJsonFile(manifestPath, schema)).resolves.toEqual({
      custom: true,
      name: "example",
    });
    await writeFile(manifestPath, '{"name":42}');
    await expect(readJsonFile(manifestPath, schema)).rejects.toThrow(
      "Expected string"
    );
  });

  it("preserves existing key positions when updating a dependency", async () => {
    const source = `{
  "name": "web",
  "private": true,
  "scripts": {
    "test": "vitest"
  },
  "dependencies": {
    "zeta": "^1.0.0",
    "@repo/cms": "workspace:@repo/cms-drupal@*",
    "alpha": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
`;
    const { manifestPath, workspaceRoot } = await packageFixture(source);

    await applyPackageEntries(workspaceRoot, [
      {
        cwd: "apps/web",
        name: "@repo/cms",
        section: "dependencies",
        specifier: "workspace:@repo/cms-contentstack@*",
      },
    ]);

    await expect(readFile(manifestPath, "utf-8")).resolves.toBe(
      source.replace(
        "workspace:@repo/cms-drupal@*",
        "workspace:@repo/cms-contentstack@*"
      )
    );
  });

  it("appends new keys without sorting existing keys", async () => {
    const source = `{
  "name": "web",
  "dependencies": {
    "zeta": "^1.0.0",
    "alpha": "^1.0.0"
  }
}
`;
    const { manifestPath, workspaceRoot } = await packageFixture(source);

    await applyPackageEntries(workspaceRoot, [
      {
        cwd: "apps/web",
        name: "new-client",
        section: "dependencies",
        specifier: "^1.0.0",
      },
      {
        cwd: "apps/web",
        name: "vitest",
        section: "devDependencies",
        specifier: "^3.2.4",
      },
    ]);

    await expect(readFile(manifestPath, "utf-8")).resolves.toBe(`{
  "name": "web",
  "dependencies": {
    "zeta": "^1.0.0",
    "alpha": "^1.0.0",
    "new-client": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
`);
  });

  it("does not rewrite a manifest when its package entries are unchanged", async () => {
    const source =
      '{"name":"web","dependencies":{"@repo/cms":"workspace:@repo/cms-contentstack@*"}}\n';
    const { manifestPath, workspaceRoot } = await packageFixture(source);

    await applyPackageEntries(workspaceRoot, [
      {
        cwd: "apps/web",
        name: "@repo/cms",
        section: "dependencies",
        specifier: "workspace:@repo/cms-contentstack@*",
      },
    ]);

    await expect(readFile(manifestPath, "utf-8")).resolves.toBe(source);
  });

  it("does not rewrite a manifest when a removed catalog entry is absent", async () => {
    const source = '{"name":"web","dependencies":{"alpha":"^1.0.0"}}\n';
    const { manifestPath, workspaceRoot } = await packageFixture(source);

    await applyPackageRequirements(workspaceRoot, removalPlan());

    await expect(readFile(manifestPath, "utf-8")).resolves.toBe(source);
  });

  it("preserves remaining key positions when removing a dependency", async () => {
    const source = `{
  "name": "web",
  "dependencies": {
    "zeta": "^1.0.0",
    "remove-me": "^1.0.0",
    "alpha": "^1.0.0"
  },
  "private": true
}
`;
    const { manifestPath, workspaceRoot } = await packageFixture(source);

    await applyPackageRequirements(workspaceRoot, removalPlan());

    await expect(readFile(manifestPath, "utf-8")).resolves.toBe(`{
  "name": "web",
  "dependencies": {
    "zeta": "^1.0.0",
    "alpha": "^1.0.0"
  },
  "private": true
}
`);
  });
});
