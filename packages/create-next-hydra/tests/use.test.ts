import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  formatCompositionPreview,
  formatCompositionResult,
} from "../src/composition/format.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";
import {
  installCompositionDependencies,
  useComposition,
} from "../src/composition/use.js";
import { pathExists } from "../src/fs-utils.js";
import { CommandExecutionError } from "../src/git.js";
import type { runCommand } from "../src/git.js";

type UseCompositionDependencies = NonNullable<
  Parameters<typeof useComposition>[1]
>;
type InstallComposition = NonNullable<UseCompositionDependencies["install"]>;
type ConfirmComposition = NonNullable<UseCompositionDependencies["confirm"]>;

const temporaryDirectories: string[] = [];
const MANAGED_FILE_DRIFT = /managed file differs/u;
const PACKAGE_JSON_TARGETS = /package\.json targets/u;
const INVALID_DEPENDENCY_SECTION = /dependencies: Expected object/u;
const SOURCE_REGISTRY_SCHEMA_URL =
  "https://raw.githubusercontent.com/jakala-na/next-hydra/main/packages/create-next-hydra/schema/source-registry.json";
const DRUPAL_SELECTION = `{
  "providers": {
    "auth": "workos",
    "cms": "drupal",
    "commerce": "commercetools"
  },
  "addOns": []
}
`;
const packageManifestSchema = z.object({
  dependencies: z.record(z.string()),
});

const packageRequirements = (
  name: string,
  implementation: string,
  workspaces: readonly string[]
) =>
  workspaces.map((cwd) => ({
    cwd,
    name,
    section: "dependencies",
    specifier: `workspace:${implementation}@*`,
  }));

const managedFile = (target: string) => ({
  path: `registry/${target.replace(/^~\//u, "")}`,
  target,
  type: "registry:file",
});

const provider = (options: {
  readonly id: string;
  readonly name: string;
  readonly slot: "auth" | "cms" | "commerce";
  readonly packages: ReturnType<typeof packageRequirements>;
  readonly files?: readonly ReturnType<typeof managedFile>[];
  readonly assets?: readonly {
    readonly source: string;
    readonly target: string;
  }[];
  readonly pnpmPatches?: readonly {
    readonly dependency: string;
    readonly path: string;
  }[];
}) => ({
  $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
  files: options.files ?? [],
  meta: {
    nextHydra: {
      assets: options.assets ?? [],
      id: options.id,
      kind: "provider",
      packages: options.packages,
      pnpmPatches: options.pnpmPatches ?? [],
      slot: options.slot,
    },
  },
  name: options.name,
  type: "registry:item",
});

const sourceRegistry = (item: ReturnType<typeof provider>) => ({
  $schema: SOURCE_REGISTRY_SCHEMA_URL,
  items: [item],
});

const AUTH_REGISTRY = "packages/auth-workos/registry.json";
const CONTENTSTACK_REGISTRY = "packages/cms-contentstack/registry.json";
const DRUPAL_REGISTRY = "packages/cms-drupal/registry.json";
const COMMERCETOOLS_REGISTRY = "packages/commerce-commercetools/registry.json";

const authProvider = provider({
  id: "next-hydra/auth/workos",
  name: "auth-workos",
  packages: packageRequirements("@repo/auth", "@repo/auth-workos", [
    "apps/api",
    "apps/web",
    "packages/feature-flags",
  ]),
  slot: "auth",
});

const contentstackProvider = provider({
  files: [managedFile("~/apps/web/app/api/draft/route.ts")],
  id: "next-hydra/cms/contentstack",
  name: "cms-contentstack",
  packages: [
    ...packageRequirements("@repo/cms", "@repo/cms-contentstack", [
      "apps/cli",
      "apps/web",
    ]),
    {
      cwd: "apps/web",
      name: "contentstack-only",
      section: "dependencies",
      specifier: "^1.0.0",
    },
  ],
  slot: "cms",
});

const drupalProvider = provider({
  assets: [
    {
      source: ".fixture-assets/drupal.patch",
      target: "patches/@drupal-canvas__headless.patch",
    },
  ],
  files: [
    managedFile("~/apps/web/app/api/draft/route.ts"),
    managedFile("~/apps/web/app/api/canvas/components/route.ts"),
  ],
  id: "next-hydra/cms/drupal",
  name: "cms-drupal",
  packages: packageRequirements("@repo/cms", "@repo/cms-drupal", [
    "apps/cli",
    "apps/web",
  ]),
  pnpmPatches: [
    {
      dependency: "@drupal-canvas/headless",
      path: "patches/@drupal-canvas__headless.patch",
    },
  ],
  slot: "cms",
});

const commercetoolsProvider = provider({
  id: "next-hydra/commerce/commercetools",
  name: "commerce-commercetools",
  packages: packageRequirements(
    "@repo/commerce-provider",
    "@repo/commerce-commercetools",
    ["apps/api", "apps/cli", "apps/web"]
  ),
  slot: "commerce",
});

const fixtureRegistry = {
  $schema: SOURCE_REGISTRY_SCHEMA_URL,
  homepage: "https://example.com/next-hydra-use-fixture",
  include: [
    AUTH_REGISTRY,
    CONTENTSTACK_REGISTRY,
    DRUPAL_REGISTRY,
    COMMERCETOOLS_REGISTRY,
  ],
  items: [],
  name: "next-hydra-use-fixture",
};

const maintainerFixture = async (): Promise<string> => {
  const fixture = await mkdtemp(path.join(tmpdir(), "next-hydra-use-"));
  temporaryDirectories.push(fixture);
  await Promise.all(
    [
      ["registry.json", `${JSON.stringify(fixtureRegistry, null, 2)}\n`],
      [
        AUTH_REGISTRY,
        `${JSON.stringify(sourceRegistry(authProvider), null, 2)}\n`,
      ],
      [
        CONTENTSTACK_REGISTRY,
        `${JSON.stringify(sourceRegistry(contentstackProvider), null, 2)}\n`,
      ],
      [
        DRUPAL_REGISTRY,
        `${JSON.stringify(sourceRegistry(drupalProvider), null, 2)}\n`,
      ],
      [
        COMMERCETOOLS_REGISTRY,
        `${JSON.stringify(sourceRegistry(commercetoolsProvider), null, 2)}\n`,
      ],
      ["next-hydra.json", DRUPAL_SELECTION],
      [
        "pnpm-workspace.yaml",
        'packages:\n  - "apps/*"\n  - "packages/*"\npatchedDependencies:\n  "@drupal-canvas/headless": patches/@drupal-canvas__headless.patch\n',
      ],
      ["package.json", '{"name":"fixture","private":true}\n'],
      [".fixture-assets/drupal.patch", "fixture patch\n"],
      [
        "packages/cms-contentstack/registry/apps/web/app/api/draft/route.ts",
        'export { GET } from "@repo/cms/routes/draft";\n',
      ],
      [
        "packages/cms-drupal/registry/apps/web/app/api/draft/route.ts",
        'export { enableCanvasDraft as GET } from "@repo/cms/routes/canvas";\n',
      ],
      [
        "packages/cms-drupal/registry/apps/web/app/api/canvas/components/route.ts",
        'export { getCanvasComponents as GET } from "@repo/cms/routes/canvas";\n',
      ],
    ].map(async ([relative, content]) => {
      if (!(relative && content)) {
        throw new Error("Invalid maintainer fixture file.");
      }
      const destination = path.join(fixture, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
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
};

const readWebDependencies = async (cwd: string) =>
  packageManifestSchema.parse(
    JSON.parse(await readFile(path.join(cwd, "apps/web/package.json"), "utf-8"))
  ).dependencies;

const noOpInstall = () =>
  vi.fn<InstallComposition>().mockResolvedValue(undefined);

describe("maintainer use", () => {
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("updates the lockfile after changing the workspace composition", async () => {
    const execute = vi
      .fn<typeof runCommand>()
      .mockResolvedValue({ stderr: "", stdout: "" });

    await installCompositionDependencies("/workspace", true, execute);

    expect(execute).toHaveBeenCalledWith(
      "pnpm",
      ["install", "--no-frozen-lockfile"],
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
          install: () => {
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
    const install = noOpInstall();

    await useComposition({ cms: "contentstack", cwd, yes: true }, { install });
    const contentstackDependencies = await readWebDependencies(cwd);
    const contentstackWorkspace = await readFile(
      path.join(cwd, "pnpm-workspace.yaml"),
      "utf-8"
    );
    expect({
      canvasRouteExists: await pathExists(
        path.join(cwd, "apps/web/app/api/canvas/components/route.ts")
      ),
      cmsAlias: contentstackDependencies["@repo/cms"],
      contentstackOnly: contentstackDependencies["contentstack-only"],
      draftRoute: await readFile(
        path.join(cwd, "apps/web/app/api/draft/route.ts"),
        "utf-8"
      ),
      hasDrupalPatch: contentstackWorkspace.includes(
        "patches/@drupal-canvas__headless.patch"
      ),
      selection: await readFile(selectionPath, "utf-8"),
    }).toEqual({
      canvasRouteExists: false,
      cmsAlias: "workspace:@repo/cms-contentstack@*",
      contentstackOnly: "^1.0.0",
      draftRoute: 'export { GET } from "@repo/cms/routes/draft";\n',
      hasDrupalPatch: false,
      selection: DRUPAL_SELECTION.replace(
        '"cms": "drupal"',
        '"cms": "contentstack"'
      ),
    });
    await useComposition({ check: true, cwd });

    await useComposition({ cms: "drupal", cwd, yes: true }, { install });
    const drupalDependencies = await readWebDependencies(cwd);
    const drupalWorkspace = await readFile(
      path.join(cwd, "pnpm-workspace.yaml"),
      "utf-8"
    );
    expect({
      canvasRoute: await readFile(
        path.join(cwd, "apps/web/app/api/canvas/components/route.ts"),
        "utf-8"
      ),
      contentstackOnly: drupalDependencies["contentstack-only"],
      draftRoute: await readFile(
        path.join(cwd, "apps/web/app/api/draft/route.ts"),
        "utf-8"
      ),
      hasDrupalPatch: drupalWorkspace.includes(
        "patches/@drupal-canvas__headless.patch"
      ),
      installCount: install.mock.calls.length,
      selection: await readFile(selectionPath, "utf-8"),
    }).toEqual({
      canvasRoute:
        'export { getCanvasComponents as GET } from "@repo/cms/routes/canvas";\n',
      contentstackOnly: undefined,
      draftRoute:
        'export { enableCanvasDraft as GET } from "@repo/cms/routes/canvas";\n',
      hasDrupalPatch: true,
      installCount: 2,
      selection: DRUPAL_SELECTION,
    });

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
    const install = noOpInstall();

    await useComposition(
      { cms: "contentstack", cwd, dryRun: true },
      { install }
    );

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    expect(install).not.toHaveBeenCalled();
  });

  it("requires confirmation before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf-8");
    const confirm = vi.fn<ConfirmComposition>().mockResolvedValue(false);
    const install = noOpInstall();

    await expect(
      useComposition({ cms: "contentstack", cwd }, { confirm, install })
    ).rejects.toThrow("No changes were made");

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    expect(install).not.toHaveBeenCalled();
  });

  it("does not recompose an unchanged selection", async () => {
    const cwd = await maintainerFixture();
    const selectionPath = path.join(cwd, "next-hydra.json");
    const selectionBefore = await readFile(selectionPath, "utf-8");
    const install = noOpInstall();

    await useComposition({ cwd, yes: true }, { install });

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    expect(install).not.toHaveBeenCalled();
  });

  it("rejects missing package manifests before changing the workspace", async () => {
    const cwd = await maintainerFixture();
    const selectionBefore = await readFile(
      path.join(cwd, "next-hydra.json"),
      "utf-8"
    );
    const webManifest = path.join(cwd, "apps/web/package.json");
    const webManifestBefore = await readFile(webManifest, "utf-8");
    const install = noOpInstall();
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
      useComposition({ addOns: [addOnPath], cwd, yes: true }, { install })
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
    const install = noOpInstall();

    await expect(
      useComposition({ cms: "contentstack", cwd, yes: true }, { install })
    ).rejects.toThrow(INVALID_DEPENDENCY_SECTION);

    await expect(readFile(selectionPath, "utf-8")).resolves.toBe(
      selectionBefore
    );
    await expect(readFile(webManifest, "utf-8")).resolves.toBe(
      webManifestBefore
    );
  });
});
