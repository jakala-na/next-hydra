import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { addRegistryItem } from "../src/composition/add.js";
import { CompositionValidationError } from "../src/composition/errors.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";

const mutableArtifact = (content: string) =>
  `${JSON.stringify({
    files: [
      {
        content,
        path: "approved.ts",
        target: "~/src/approved.ts",
        type: "registry:file",
      },
    ],
    name: "mutable",
    type: "registry:item",
  })}\n`;

const temporaryDirectories: string[] = [];
const fixtureRegistrySchema = z
  .object({
    dependencies: z.array(z.string()).optional(),
    meta: z
      .object({
        nextHydra: z
          .object({
            compatibility: z
              .object({ requires: z.array(z.string()) })
              .passthrough(),
          })
          .passthrough(),
      })
      .passthrough(),
    registryDependencies: z.array(z.string()).optional(),
  })
  .passthrough();
function parseFixtureManifest(source: string) {
  return z
    .object({ dependencies: z.record(z.string()) })
    .passthrough()
    .parse(JSON.parse(source));
}
function parseFixtureArtifact(source: string) {
  return fixtureRegistrySchema.parse(JSON.parse(source));
}
const OVERWRITE_REQUIRED = /requires --overwrite/u;
const PROVIDER_ALIAS_MISMATCH = /current provider alias/u;
const EXACT_COPY_FILES = /exact-copy registry files/u;
const INVALID_PACKAGE_JSON = /not a valid package\.json/u;

async function verifyProviderGuidance() {
  const root = await mkdtemp(path.join(tmpdir(), "provider-guidance-"));
  temporaryDirectories.push(root);
  await writeFile(
    path.join(root, "package.json"),
    '{"name":"customer","private":true}\n'
  );
  const artifact = path.join(root, "provider.json");
  await writeFile(
    artifact,
    JSON.stringify({
      $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
      meta: {
        nextHydra: {
          binding: { specifier: "workspace:*" },
          id: "fixture/cms/provider",
          kind: "provider",
          slot: "cms",
        },
      },
      name: "fixture-provider",
      type: "registry:item",
    })
  );
  await expect(
    addRegistryItem(artifact, { cwd: root, yes: true })
  ).rejects.toThrow("create-next-hydra compose <name>");
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "next-hydra-add-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "packages/cms-drupal"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    '{"name":"customer","private":true,"dependencies":{}}\n'
  );
  await mkdir(path.join(root, "apps/web"), { recursive: true });
  await writeFile(
    path.join(root, "apps/web/package.json"),
    '{"name":"web","dependencies":{"@repo/cms":"workspace:@repo/cms-drupal@*"}}\n'
  );
  await writeFile(
    path.join(root, "packages/cms-drupal/package.json"),
    '{"name":"@repo/cms-drupal","dependencies":{}}\n'
  );
  const artifactPath = path.join(root, "dam-addon.json");
  await writeFile(
    artifactPath,
    `${JSON.stringify(
      {
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        docs: "Enable the matching Drupal module after reviewing its configuration.",
        files: [
          {
            content: "export const dam = true;\n",
            path: "dam.ts",
            target: "~/packages/cms-drupal/integrations/dam.ts",
            type: "registry:file",
          },
          {
            content:
              "export const POST = () => new Response(null, { status: 204 });\n",
            path: "registry/apps/web/app/api/dam/sync/route.ts",
            target: "~/apps/web/app/api/dam/sync/route.ts",
            type: "registry:file",
          },
        ],
        meta: {
          nextHydra: {
            compatibility: {
              conflicts: [],
              requires: ["next-hydra/cms/drupal"],
            },
            id: "example/add-on/dam",
            kind: "add-on",
            packages: [
              {
                cwd: "packages/cms-drupal",
                name: "example-dam-client",
                section: "dependencies",
                specifier: "^1.0.0",
              },
            ],
          },
        },
        name: "dam-addon",
        type: "registry:item",
      },
      null,
      2
    )}\n`
  );
  return { artifactPath, root };
}

describe("customer add", () => {
  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it(
    "directs provider selection to scaffolding and named composition, not the retired command",
    verifyProviderGuidance
  );

  it("rejects template slot bindings before mutating customer-owned source", async () => {
    const { root, artifactPath } = await fixture();
    await writeFile(
      artifactPath,
      JSON.stringify({
        files: [
          {
            content: "export const feature = true;",
            path: "feature.ts",
            target: "~/feature.ts",
            type: "registry:file",
          },
        ],
        meta: {
          composition: {
            slotBindings: [
              {
                export: "Feature",
                module: "./feature",
                slot: "providers",
                target: "apps/web/layout.tsx",
              },
            ],
          },
        },
        name: "composed-feature",
        type: "registry:item",
      })
    );
    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow(CompositionValidationError);
    await expect(readFile(path.join(root, "feature.ts"))).rejects.toThrow(
      "ENOENT"
    );
  });

  it.each([false, true])(
    "rejects a composition recipe without slot bindings before writing (nested=%s)",
    async (nested) => {
      const { root, artifactPath } = await fixture();
      const recipePath = path.join(root, "recipe.json");
      await writeFile(
        recipePath,
        JSON.stringify({
          $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
          files: [
            {
              content: "export const feature = true;",
              path: "feature.ts",
              target: "~/feature.ts",
              type: "registry:file",
            },
          ],
          meta: { nextHydra: { id: "example/recipe", kind: "recipe" } },
          name: "example-recipe",
          type: "registry:item",
        })
      );
      await writeFile(
        artifactPath,
        JSON.stringify({
          name: "example-add-on",
          registryDependencies: [recipePath],
          type: "registry:item",
        })
      );

      await expect(
        addRegistryItem(nested ? artifactPath : recipePath, {
          cwd: root,
          yes: true,
        })
      ).rejects.toThrow("Select composition recipes during scaffolding");
      await expect(readFile(path.join(root, "feature.ts"))).rejects.toThrow(
        "ENOENT"
      );
    }
  );

  it("accepts an ordinary registry item without Next Hydra workspace metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "next-hydra-ordinary-add-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    const artifactPath = path.join(root, "ordinary.json");
    await writeFile(
      artifactPath,
      `${JSON.stringify({
        files: [
          {
            content: "export const ordinary = true;\n",
            path: "ordinary.ts",
            target: "~/src/ordinary.ts",
            type: "registry:file",
          },
        ],
        name: "ordinary",
        type: "registry:item",
      })}\n`
    );

    await addRegistryItem(artifactPath, { cwd: root, yes: true });

    await expect(
      readFile(path.join(root, "src/ordinary.ts"), "utf-8")
    ).resolves.toBe("export const ordinary = true;\n");
  });

  it("rejects registry files that ShadCN would transform before writing", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "next-hydra-transformed-add-")
    );
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    const artifactPath = path.join(root, "component.json");
    await writeFile(
      artifactPath,
      `${JSON.stringify({
        files: [
          {
            content: 'import { cn } from "@/lib/utils";\n',
            path: "component.tsx",
            target: "~/src/component.tsx",
            type: "registry:component",
          },
        ],
        name: "component",
        type: "registry:item",
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, {
        cwd: root,
        overwrite: true,
        yes: true,
      })
    ).rejects.toThrow(EXACT_COPY_FILES);
    await expect(
      readFile(path.join(root, "src/component.tsx"), "utf-8")
    ).rejects.toThrow("ENOENT");
  });

  it("uses ShadCN whitespace normalization when detecting identical files", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "next-hydra-normalized-add-")
    );
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    await mkdir(path.join(root, "src"));
    const target = path.join(root, "src/ordinary.ts");
    const existing = "\r\nexport const ordinary = true;\r\n\r\n";
    await writeFile(target, existing);
    const artifactPath = path.join(root, "ordinary.json");
    await writeFile(
      artifactPath,
      `${JSON.stringify({
        files: [
          {
            content: "export const ordinary = true;\n",
            path: "ordinary.ts",
            target: "~/src/ordinary.ts",
            type: "registry:file",
          },
        ],
        name: "ordinary",
        type: "registry:item",
      })}\n`
    );

    await addRegistryItem(artifactPath, { cwd: root, yes: true });

    await expect(readFile(target, "utf-8")).resolves.toBe(existing);
  });

  it("creates missing files, skips identical files, and never deletes other code", async () => {
    const { root, artifactPath } = await fixture();
    const unrelated = path.join(root, "customer-owned.ts");
    const install = vi
      .fn<(cwd: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    await writeFile(unrelated, "keep me\n");

    await addRegistryItem(artifactPath, { cwd: root, yes: true }, { install });
    await addRegistryItem(artifactPath, { cwd: root, yes: true }, { install });

    await expect(
      readFile(
        path.join(root, "packages/cms-drupal/integrations/dam.ts"),
        "utf-8"
      )
    ).resolves.toBe("export const dam = true;\n");
    await expect(readFile(unrelated, "utf-8")).resolves.toBe("keep me\n");
    expect(install.mock.calls).toEqual([[root]]);
    await expect(
      readFile(path.join(root, "apps/web/app/api/dam/sync/route.ts"), "utf-8")
    ).resolves.toContain("export const POST");
    expect(
      parseFixtureManifest(
        await readFile(
          path.join(root, "packages/cms-drupal/package.json"),
          "utf-8"
        )
      ).dependencies["example-dam-client"]
    ).toBe("^1.0.0");
  });

  it("refuses changed customer files under --yes and leaves them intact", async () => {
    const { root, artifactPath } = await fixture();
    const target = path.join(root, "packages/cms-drupal/integrations/dam.ts");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "customer improvement\n");

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow(OVERWRITE_REQUIRED);
    await expect(readFile(target, "utf-8")).resolves.toBe(
      "customer improvement\n"
    );
  });

  it("overwrites disclosed file and package conflicts under --yes --overwrite", async () => {
    const { root, artifactPath } = await fixture();
    const target = path.join(root, "packages/cms-drupal/integrations/dam.ts");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "customer improvement\n");
    await writeFile(
      path.join(root, "packages/cms-drupal/package.json"),
      '{"name":"@repo/cms-drupal","dependencies":{"example-dam-client":"^0.5.0"}}\n'
    );

    await addRegistryItem(
      artifactPath,
      {
        cwd: root,
        overwrite: true,
        yes: true,
      },
      { install: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
    );

    await expect(readFile(target, "utf-8")).resolves.toBe(
      "export const dam = true;\n"
    );
    expect(
      parseFixtureManifest(
        await readFile(
          path.join(root, "packages/cms-drupal/package.json"),
          "utf-8"
        )
      ).dependencies["example-dam-client"]
    ).toBe("^1.0.0");
  });

  it("discloses and refuses conflicting standard registry dependencies", async () => {
    const { artifactPath, root } = await fixture();
    const artifact = parseFixtureArtifact(
      await readFile(artifactPath, "utf-8")
    );
    artifact.dependencies = ["standard-dam-client@^2.0.0"];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({
        dependencies: { "standard-dam-client": "^1.0.0" },
        name: "customer",
        private: true,
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow(OVERWRITE_REQUIRED);
    expect(
      parseFixtureManifest(
        await readFile(path.join(root, "package.json"), "utf-8")
      ).dependencies["standard-dam-client"]
    ).toBe("^1.0.0");
  });

  it("cancels before changing a customer workspace", async () => {
    const { artifactPath, root } = await fixture();
    const target = path.join(root, "packages/cms-drupal/integrations/dam.ts");

    await expect(
      addRegistryItem(
        artifactPath,
        { cwd: root },
        { confirm: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) }
      )
    ).rejects.toThrow("Installation cancelled");

    await expect(readFile(target, "utf-8")).rejects.toThrow("ENOENT");
  });

  it("installs and checks the complete registry dependency graph", async () => {
    const { artifactPath, root } = await fixture();
    const dependencyPath = path.join(root, "dam-backend.json");
    const artifact = parseFixtureArtifact(
      await readFile(artifactPath, "utf-8")
    );
    artifact.registryDependencies = [dependencyPath];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      dependencyPath,
      `${JSON.stringify({
        files: [
          {
            content: "name: Next Hydra DAM\ntype: module\n",
            path: "next_hydra_dam.info.yml",
            target:
              "~/apps/drupal/docroot/modules/custom/next_hydra_dam/next_hydra_dam.info.yml",
            type: "registry:file",
          },
        ],
        name: "dam-backend",
        type: "registry:item",
      })}\n`
    );

    await addRegistryItem(
      artifactPath,
      { cwd: root, yes: true },
      { install: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
    );

    await expect(
      readFile(
        path.join(
          root,
          "apps/drupal/docroot/modules/custom/next_hydra_dam/next_hydra_dam.info.yml"
        ),
        "utf-8"
      )
    ).resolves.toContain("name: Next Hydra DAM");
  });

  it("rejects target collisions in registry dependencies before writing", async () => {
    const { artifactPath, root } = await fixture();
    const dependencyPath = path.join(root, "dam-collision.json");
    const artifact = parseFixtureArtifact(
      await readFile(artifactPath, "utf-8")
    );
    artifact.registryDependencies = [dependencyPath];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      dependencyPath,
      `${JSON.stringify({
        files: [
          {
            content: "export const dam = false;\n",
            path: "other-dam.ts",
            target: "~/packages/cms-drupal/integrations/dam.ts",
            type: "registry:file",
          },
        ],
        name: "dam-collision",
        type: "registry:item",
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow(CompositionValidationError);
    await expect(
      readFile(
        path.join(root, "packages/cms-drupal/integrations/dam.ts"),
        "utf-8"
      )
    ).rejects.toThrow("ENOENT");
  });

  it("does not accept a similarly named package as the required Provider alias", async () => {
    const { artifactPath, root } = await fixture();
    await writeFile(
      path.join(root, "apps/web/package.json"),
      '{"name":"web","dependencies":{"@repo/cms":"workspace:@repo/cms-drupal-fork@*"}}\n'
    );

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow("requires next-hydra/cms/drupal");
  });

  it("validates a fetched Provider from its exact binding", async () => {
    const { artifactPath, root } = await fixture();
    const providerPath = path.join(root, "private-cms.json");
    const artifact = parseFixtureArtifact(
      await readFile(artifactPath, "utf-8")
    );
    artifact.meta.nextHydra.compatibility.requires = ["vendor/cms/private"];
    artifact.registryDependencies = [providerPath];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      path.join(root, "apps/web/package.json"),
      '{"name":"web","dependencies":{"@repo/cms":"workspace:*"}}\n'
    );
    await writeFile(
      providerPath,
      `${JSON.stringify({
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        meta: {
          nextHydra: {
            binding: {
              specifier: "workspace:*",
            },
            id: "vendor/cms/private",
            kind: "provider",
            slot: "cms",
          },
        },
        name: "private-cms",
        type: "registry:item",
      })}\n`
    );

    await expect(
      addRegistryItem(
        artifactPath,
        { cwd: root, yes: true },
        { install: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
      )
    ).resolves.toBeUndefined();
  });

  it("does not let a nested Provider switch the customer alias", async () => {
    const { artifactPath, root } = await fixture();
    const providerPath = path.join(root, "nested-drupal-provider.json");
    const artifact = parseFixtureArtifact(
      await readFile(artifactPath, "utf-8")
    );
    artifact.meta.nextHydra.compatibility.requires = [];
    artifact.registryDependencies = [providerPath];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      path.join(root, "apps/web/package.json"),
      '{"name":"web","dependencies":{"@repo/cms":"workspace:@repo/cms-contentstack@*"}}\n'
    );
    await writeFile(
      providerPath,
      `${JSON.stringify({
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        files: [
          {
            content: "export const drupalProvider = true;\n",
            path: "provider.ts",
            target: "~/packages/cms-drupal/provider.ts",
            type: "registry:file",
          },
        ],
        meta: {
          nextHydra: {
            binding: {
              specifier: "workspace:@repo/cms-drupal@*",
            },
            id: "next-hydra/cms/drupal",
            kind: "provider",
            slot: "cms",
          },
        },
        name: "nested-drupal-provider",
        type: "registry:item",
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, {
        cwd: root,
        overwrite: true,
        yes: true,
      })
    ).rejects.toThrow(PROVIDER_ALIAS_MISMATCH);

    expect(
      parseFixtureManifest(
        await readFile(path.join(root, "apps/web/package.json"), "utf-8")
      ).dependencies["@repo/cms"]
    ).toBe("workspace:@repo/cms-contentstack@*");
    await expect(
      readFile(path.join(root, "packages/cms-drupal/provider.ts"), "utf-8")
    ).rejects.toThrow("ENOENT");
  });

  it("installs the exact registry graph that was approved", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "next-hydra-approved-add-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    const artifactPath = path.join(root, "mutable.json");
    await writeFile(artifactPath, mutableArtifact("approved content\n"));

    await addRegistryItem(
      artifactPath,
      { cwd: root },
      {
        confirm: async () => {
          await writeFile(
            artifactPath,
            mutableArtifact("changed after approval\n")
          );
          return true;
        },
      }
    );

    await expect(
      readFile(path.join(root, "src/approved.ts"), "utf-8")
    ).resolves.toBe("approved content\n");
  });

  it("applies package requirements to a package supplied by the Add-on", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "next-hydra-new-package-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    await mkdir(path.join(root, "apps/web"), { recursive: true });
    await writeFile(
      path.join(root, "apps/web/package.json"),
      '{"name":"web","dependencies":{"@repo/cms":"workspace:@repo/cms-drupal@*"}}\n'
    );
    const artifactPath = path.join(root, "new-package.json");
    await writeFile(
      artifactPath,
      `${JSON.stringify({
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        files: [
          {
            content: '{"name":"@vendor/new-package","dependencies":{}}\n',
            path: "package.json",
            target: "~/packages/new-package/package.json",
            type: "registry:file",
          },
        ],
        meta: {
          nextHydra: {
            id: "vendor/add-on/new-package",
            kind: "add-on",
            packages: [
              {
                cwd: "packages/new-package",
                name: "example-client",
                section: "dependencies",
                specifier: "^1.0.0",
              },
            ],
            providerDependencies: [
              {
                cwd: "packages/new-package",
                section: "dependencies",
                slot: "cms",
              },
            ],
          },
        },
        name: "new-package",
        type: "registry:item",
      })}\n`
    );

    await addRegistryItem(
      artifactPath,
      { cwd: root, yes: true },
      { install: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
    );

    expect(
      parseFixtureManifest(
        await readFile(
          path.join(root, "packages/new-package/package.json"),
          "utf-8"
        )
      ).dependencies["example-client"]
    ).toBe("^1.0.0");
    expect(
      parseFixtureManifest(
        await readFile(
          path.join(root, "packages/new-package/package.json"),
          "utf-8"
        )
      ).dependencies["@repo/cms"]
    ).toBe("workspace:@repo/cms-drupal@*");
  });

  it("rejects a supplied package.json with the wrong shape before writing", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "next-hydra-invalid-package-")
    );
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    await mkdir(path.join(root, "apps/web"), { recursive: true });
    await writeFile(
      path.join(root, "apps/web/package.json"),
      '{"name":"web","dependencies":{}}\n'
    );
    const artifactPath = path.join(root, "invalid-package.json");
    await writeFile(
      artifactPath,
      `${JSON.stringify({
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        files: [
          {
            content: "null\n",
            path: "package.json",
            target: "~/packages/invalid/package.json",
            type: "registry:file",
          },
        ],
        meta: {
          nextHydra: {
            id: "vendor/add-on/invalid-package",
            kind: "add-on",
            packages: [
              {
                cwd: "packages/invalid",
                name: "example-client",
                section: "dependencies",
                specifier: "^1.0.0",
              },
            ],
          },
        },
        name: "invalid-package",
        type: "registry:item",
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow(INVALID_PACKAGE_JSON);
    await expect(
      readFile(path.join(root, "packages/invalid/package.json"), "utf-8")
    ).rejects.toThrow("ENOENT");
  });
});
