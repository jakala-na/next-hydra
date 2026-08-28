import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CompositionPlan } from "../src/composition/types.js";
import {
  applyPackageEntries,
  applyPackageRequirements,
  readWorkspaceSelection,
} from "../src/composition/workspace.js";

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
    typeScriptPathAliases: [],
    variableTargets: [],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe("package manifest updates", () => {
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

describe("workspace selection updates", () => {
  it("appends defaulted keys without reordering existing keys", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(tmpdir(), "next-hydra-selection-")
    );
    temporaryDirectories.push(workspaceRoot);
    await writeFile(
      path.join(workspaceRoot, "next-hydra.json"),
      `{
  "providers": {
    "commerce": "commercetools",
    "auth": "workos",
    "cms": "drupal"
  }
}
`
    );

    const selection = await readWorkspaceSelection(workspaceRoot);

    expect(Object.keys(selection)).toStrictEqual(["providers", "addOns"]);
    expect(Object.keys(selection.providers)).toStrictEqual([
      "commerce",
      "auth",
      "cms",
    ]);
    expect(selection.addOns).toStrictEqual([]);
  });
});
