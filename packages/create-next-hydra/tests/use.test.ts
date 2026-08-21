import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatCompositionPreview,
  formatCompositionResult,
} from "../src/composition/format.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";
import {
  installCompositionDependencies,
  useComposition,
} from "../src/composition/use.js";
import { CommandExecutionError } from "../src/git.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const run = promisify(execFile);
const temporaryDirectories: string[] = [];
const MANAGED_FILE_DRIFT = /managed file differs/;
const PACKAGE_JSON_TARGETS = /package\.json targets/;
const INVALID_DEPENDENCY_SECTION = /dependencies: Expected object/;
const DRUPAL_SELECTION = `{
  "providers": {
    "auth": "workos",
    "cms": "drupal",
    "commerce": "commercetools"
  },
  "addOns": []
}
`;

async function maintainerFixture(): Promise<string> {
  const fixture = await mkdtemp(path.join(tmpdir(), "next-hydra-use-"));
  temporaryDirectories.push(fixture);
  await cp(
    path.join(repoRoot, "registry.json"),
    path.join(fixture, "registry.json")
  );
  await writeFile(path.join(fixture, "next-hydra.json"), DRUPAL_SELECTION);
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
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe("maintainer use", () => {
  it("relinks dependencies after changing the workspace composition", async () => {
    const execute = vi.fn().mockResolvedValue({ stderr: "", stdout: "" });

    await installCompositionDependencies("/workspace", true, execute);

    expect(execute).toHaveBeenCalledWith(
      "pnpm",
      ["install", "--no-frozen-lockfile", "--force"],
      {
        cwd: "/workspace",
        verbose: true,
      }
    );
  });

  it("includes package-manager output when dependency installation fails", async () => {
    const cwd = await maintainerFixture();

    await expect(
      useComposition(
        { cms: "contentstack", cwd, yes: true },
        {
          install: async () => {
            throw new CommandExecutionError({
              code: 1,
              command: "pnpm install",
              stderr: "ERR_PNPM_LOCKFILE_CONFIG_MISMATCH",
              stdout: "",
            });
          },
        }
      )
    ).rejects.toThrow("ERR_PNPM_LOCKFILE_CONFIG_MISMATCH");
  });

  it("switches Drupal to Contentstack and back, then detects drift", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const contentstackRegistryPath = path.join(
      cwd,
      "packages/cms-contentstack/registry.json"
    );
    const contentstackRegistry = JSON.parse(
      await readFile(contentstackRegistryPath, "utf-8")
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
    const install = async (installCwd: string) => {
      installs.push(installCwd);
      return;
    };

    await useComposition({ cms: "contentstack", cwd, yes: true }, { install });
    expect(
      JSON.parse(
        await readFile(path.join(cwd, "apps/web/package.json"), "utf-8")
      ).dependencies["@repo/cms"]
    ).toBe("workspace:@repo/cms-contentstack@*");
    expect(
      JSON.parse(
        await readFile(path.join(cwd, "apps/web/package.json"), "utf-8")
      ).dependencies["contentstack-only"]
    ).toBe("^1.0.0");
    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      DRUPAL_SELECTION.replace('"cms": "drupal"', '"cms": "contentstack"')
    );
    await expect(
      readFile(path.join(cwd, "apps/web/app/api/draft/route.ts"), "utf-8")
    ).resolves.toContain('export { GET } from "@repo/cms/routes/draft";');
    await expect(
      readFile(
        path.join(cwd, "apps/web/app/api/canvas/components/route.ts"),
        "utf-8"
      )
    ).rejects.toThrow();
    await expect(
      readFile(path.join(cwd, "pnpm-workspace.yaml"), "utf-8")
    ).resolves.not.toContain("patches/@drupal-canvas__headless.patch");
    await useComposition({ check: true, cwd });

    await useComposition({ cms: "drupal", cwd, yes: true }, { install });
    expect(
      JSON.parse(
        await readFile(path.join(cwd, "apps/web/package.json"), "utf-8")
      ).dependencies["contentstack-only"]
    ).toBeUndefined();
    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      DRUPAL_SELECTION
    );
    await expect(
      readFile(
        path.join(cwd, "apps/web/app/api/canvas/components/route.ts"),
        "utf-8"
      )
    ).resolves.toContain("getCanvasComponents as GET");
    await expect(
      readFile(path.join(cwd, "pnpm-workspace.yaml"), "utf-8")
    ).resolves.toContain("patches/@drupal-canvas__headless.patch");
    expect(installs).toHaveLength(2);

    await writeFile(
      path.join(cwd, "apps/web/app/api/draft/route.ts"),
      "customer edit\n"
    );
    await expect(useComposition({ check: true, cwd })).rejects.toThrow(
      MANAGED_FILE_DRIFT
    );
  });

  it("shows current and proposed selections without exposing the internal plan", () => {
    const current = {
      addOns: [],
      providers: {
        auth: "workos",
        cms: "drupal",
        commerce: "commercetools",
      },
    };
    const proposed = {
      ...current,
      providers: { ...current.providers, cms: "contentstack" },
    };

    expect(formatCompositionPreview(current, proposed)).toBe(
      [
        "Maintainer workspace composition",
        "",
        "Current -> Proposed",
        "Providers:",
        "  auth: workos (unchanged)",
        "  cms: drupal -> contentstack",
        "  commerce: commercetools (unchanged)",
        "Add-ons: none (unchanged)",
        "",
        "Planned actions:",
        "  replace managed application files",
        "  install selected source",
        "  update package aliases",
        "  update pnpm patches",
        "  run pnpm install",
      ].join("\n")
    );
    expect(formatCompositionResult(current, proposed)).toBe(
      "Maintainer workspace composition updated: cms: drupal -> contentstack."
    );
    expect(formatCompositionPreview(current, current)).not.toContain(
      "Planned actions"
    );
  });

  it("does not change the workspace during a dry run", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf-8");
    let installed = false;

    await useComposition(
      { cms: "contentstack", cwd, dryRun: true },
      {
        install: async () => {
          installed = true;
          return;
        },
      }
    );

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    expect(installed).toBeFalsy();
  });

  it("requires confirmation before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf-8");
    let installed = false;

    await expect(
      useComposition(
        { cms: "contentstack", cwd },
        {
          confirm: async () => false,
          install: async () => {
            installed = true;
            return;
          },
        }
      )
    ).rejects.toThrow("No changes were made");

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    expect(installed).toBeFalsy();
  });

  it("does not recompose an unchanged selection", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf-8");
    let installed = false;

    await useComposition(
      { cwd, yes: true },
      {
        install: async () => {
          installed = true;
          return;
        },
      }
    );

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    expect(installed).toBeFalsy();
  });

  it("rejects missing package manifests before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionBefore = await readFile(
      path.join(cwd, "next-hydra.json"),
      "utf-8"
    );
    const webManifest = path.join(cwd, "apps/web/package.json");
    const webManifestBefore = await readFile(webManifest, "utf-8");
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
        { addOns: [addOnPath], cwd, yes: true },
        { install: async () => {} }
      )
    ).rejects.toThrow(PACKAGE_JSON_TARGETS);

    await expect(
      readFile(path.join(cwd, "next-hydra.json"), "utf-8")
    ).resolves.toBe(selectionBefore);
    await expect(readFile(webManifest, "utf-8")).resolves.toBe(
      webManifestBefore
    );
  });

  it("rejects malformed package.json dependency sections before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf-8");
    const webManifest = path.join(cwd, "apps/web/package.json");
    await writeFile(
      webManifest,
      '{"name":"web","dependencies":"not-an-object"}\n'
    );
    const webManifestBefore = await readFile(webManifest, "utf-8");

    await expect(
      useComposition(
        { cms: "contentstack", cwd, yes: true },
        { install: async () => {} }
      )
    ).rejects.toThrow(INVALID_DEPENDENCY_SECTION);

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    await expect(readFile(webManifest, "utf-8")).resolves.toBe(
      webManifestBefore
    );
  });
});
