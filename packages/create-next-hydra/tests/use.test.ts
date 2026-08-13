import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";
import { useComposition } from "../src/composition/use.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const run = promisify(execFile);
const temporaryDirectories: string[] = [];
const MANAGED_FILE_DRIFT = /managed file differs/;
const PACKAGE_JSON_TARGETS = /package\.json targets/;
const INVALID_DEPENDENCY_SECTION = /dependencies: Expected object/;

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
  const sourceRoots = [
    "packages/auth-workos",
    "packages/cms-contentstack",
    "packages/cms-drupal",
    "packages/commerce-commercetools",
    "apps/drupal",
    "patches",
  ];
  const { stdout } = await run(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...sourceRoots,
    ],
    { cwd: repoRoot }
  );
  await Promise.all(
    stdout
      .split("\n")
      .filter(Boolean)
      .map(async (relative) => {
        await mkdir(path.dirname(path.join(fixture, relative)), {
          recursive: true,
        });
        await cp(path.join(repoRoot, relative), path.join(fixture, relative));
      })
  );
  await cp(
    path.join(repoRoot, "package.json"),
    path.join(fixture, "package.json")
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
      MANAGED_FILE_DRIFT
    );
  });

  it("rejects missing package manifests before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionBefore = await readFile(
      path.join(cwd, "next-hydra.json"),
      "utf8"
    );
    const webManifest = path.join(cwd, "apps/web/package.json");
    const webManifestBefore = await readFile(webManifest, "utf8");
    const addOnPath = path.join(cwd, "missing-package-addon.json");
    await writeFile(
      addOnPath,
      `${JSON.stringify({
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        meta: {
          nextHydra: {
            id: "vendor/add-on/missing-package",
            kind: "add-on",
            packages: [
              {
                cwd: "packages/does-not-exist",
                name: "example-client",
                section: "dependencies",
                specifier: "^1.0.0",
              },
            ],
          },
        },
        name: "missing-package-addon",
        type: "registry:item",
      })}\n`
    );

    await expect(
      useComposition(
        { addOns: [addOnPath], cwd },
        { install: async () => undefined }
      )
    ).rejects.toThrow(PACKAGE_JSON_TARGETS);

    expect(await readFile(path.join(cwd, "next-hydra.json"), "utf8")).toBe(
      selectionBefore
    );
    expect(await readFile(webManifest, "utf8")).toBe(webManifestBefore);
  });

  it("rejects malformed package.json dependency sections before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf8");
    const webManifest = path.join(cwd, "apps/web/package.json");
    await writeFile(
      webManifest,
      '{"name":"web","dependencies":"not-an-object"}\n'
    );
    const webManifestBefore = await readFile(webManifest, "utf8");

    await expect(
      useComposition(
        { cms: "contentstack", cwd },
        { install: async () => undefined }
      )
    ).rejects.toThrow(INVALID_DEPENDENCY_SECTION);

    expect(await readFile(selectionPath, "utf8")).toBe(selectionBefore);
    expect(await readFile(webManifest, "utf8")).toBe(webManifestBefore);
  });
});
