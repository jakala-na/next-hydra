import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { useComposition } from "../src/composition/use.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const temporaryDirectories: string[] = [];
const GENERATED_ROUTE_DRIFT = /generated route differs/;

async function maintainerFixture(): Promise<string> {
  const fixture = await mkdtemp(path.join(tmpdir(), "next-hydra-use-"));
  temporaryDirectories.push(fixture);
  await cp(
    path.join(repoRoot, "registry.json"),
    path.join(fixture, "registry.json")
  );
  await cp(
    path.join(repoRoot, "next-hydra.json"),
    path.join(fixture, "next-hydra.json")
  );
  await cp(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    path.join(fixture, "pnpm-workspace.yaml")
  );
  await Promise.all(
    [
      "packages/auth-workos/registry.json",
      "packages/cms-contentstack/registry.json",
      "packages/cms-drupal/registry.json",
      "packages/commerce-commercetools/registry.json",
      "apps/drupal-hydra/registry.json",
    ].map(async (relative) => {
      await mkdir(path.dirname(path.join(fixture, relative)), {
        recursive: true,
      });
      await cp(path.join(repoRoot, relative), path.join(fixture, relative));
    })
  );
  await Promise.all(
    ["apps/api", "apps/cli", "apps/web", "packages/feature-flags"].map(
      async (relative) => {
        await mkdir(path.join(fixture, relative), { recursive: true });
        await writeFile(
          path.join(fixture, relative, "package.json"),
          `${JSON.stringify({ dependencies: {}, name: path.basename(relative) }, null, 2)}\n`
        );
      }
    )
  );
  return fixture;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("maintainer use", () => {
  it("switches Drupal to Contentstack and back, then detects drift", async () => {
    const cwd = await maintainerFixture();
    const contentstackRegistryPath = path.join(
      cwd,
      "packages/cms-contentstack/registry.json"
    );
    const contentstackRegistry = JSON.parse(
      await readFile(contentstackRegistryPath, "utf8")
    );
    contentstackRegistry.items[0].meta.nextHydra.packages.push({
      cwd: "apps/web",
      name: "contentstack-only",
      section: "dependencies",
      specifier: "^1.0.0",
    });
    await writeFile(
      contentstackRegistryPath,
      `${JSON.stringify(contentstackRegistry, null, 2)}\n`
    );
    const installs: string[] = [];
    const install = (installCwd: string) => {
      installs.push(installCwd);
      return Promise.resolve();
    };

    await useComposition({ cms: "contentstack", cwd }, { install });
    expect(
      JSON.parse(
        await readFile(path.join(cwd, "apps/web/package.json"), "utf8")
      ).dependencies["@repo/cms"]
    ).toBe("workspace:@repo/cms-contentstack@*");
    expect(
      JSON.parse(
        await readFile(path.join(cwd, "apps/web/package.json"), "utf8")
      ).dependencies["contentstack-only"]
    ).toBe("^1.0.0");
    expect(
      await readFile(path.join(cwd, "apps/web/app/api/draft/route.ts"), "utf8")
    ).toContain('export { GET } from "@repo/cms/routes/draft";');
    await expect(
      readFile(
        path.join(cwd, "apps/web/app/api/canvas/components/route.ts"),
        "utf8"
      )
    ).rejects.toThrow();
    expect(
      await readFile(path.join(cwd, "pnpm-workspace.yaml"), "utf8")
    ).not.toContain("patchedDependencies");
    await useComposition({ check: true, cwd });

    await useComposition({ cms: "drupal", cwd }, { install });
    expect(
      JSON.parse(
        await readFile(path.join(cwd, "apps/web/package.json"), "utf8")
      ).dependencies["contentstack-only"]
    ).toBeUndefined();
    expect(
      await readFile(
        path.join(cwd, "apps/web/app/api/canvas/components/route.ts"),
        "utf8"
      )
    ).toContain("getCanvasComponents as GET");
    expect(
      await readFile(path.join(cwd, "pnpm-workspace.yaml"), "utf8")
    ).toContain("patches/@drupal-canvas__headless.patch");
    expect(installs).toHaveLength(2);

    await writeFile(
      path.join(cwd, "apps/web/app/api/draft/route.ts"),
      "customer edit\n"
    );
    await expect(useComposition({ check: true, cwd })).rejects.toThrow(
      GENERATED_ROUTE_DRIFT
    );
  });
});
