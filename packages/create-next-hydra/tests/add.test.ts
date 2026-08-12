import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { addRegistryItem } from "../src/composition/add.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";

const temporaryDirectories: string[] = [];
const OVERWRITE_REQUIRED = /requires --overwrite/;
const PROVIDER_ALIAS_MISMATCH = /current provider alias/;
const EXACT_COPY_FILES = /exact-copy registry files/;
const INVALID_PACKAGE_JSON = /not a valid package\.json/;

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

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("customer add", () => {
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

    expect(await readFile(path.join(root, "src/ordinary.ts"), "utf8")).toBe(
      "export const ordinary = true;\n"
    );
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
      readFile(path.join(root, "src/component.tsx"), "utf8")
    ).rejects.toThrow();
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

    expect(await readFile(target, "utf8")).toBe(existing);
  });

  it("creates missing files, skips identical files, and never deletes other code", async () => {
    const { root, artifactPath } = await fixture();
    const unrelated = path.join(root, "customer-owned.ts");
    let installCount = 0;
    const install = (cwd: string) => {
      expect(cwd).toBe(root);
      installCount += 1;
      return Promise.resolve();
    };
    await writeFile(unrelated, "keep me\n");

    await addRegistryItem(artifactPath, { cwd: root, yes: true }, { install });
    await addRegistryItem(artifactPath, { cwd: root, yes: true }, { install });

    expect(
      await readFile(
        path.join(root, "packages/cms-drupal/integrations/dam.ts"),
        "utf8"
      )
    ).toBe("export const dam = true;\n");
    expect(await readFile(unrelated, "utf8")).toBe("keep me\n");
    expect(installCount).toBe(1);
    expect(
      await readFile(
        path.join(root, "apps/web/app/api/dam/sync/route.ts"),
        "utf8"
      )
    ).toContain("export const POST");
    expect(
      JSON.parse(
        await readFile(
          path.join(root, "packages/cms-drupal/package.json"),
          "utf8"
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
    expect(await readFile(target, "utf8")).toBe("customer improvement\n");
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
      { install: async () => undefined }
    );

    expect(await readFile(target, "utf8")).toBe("export const dam = true;\n");
    expect(
      JSON.parse(
        await readFile(
          path.join(root, "packages/cms-drupal/package.json"),
          "utf8"
        )
      ).dependencies["example-dam-client"]
    ).toBe("^1.0.0");
  });

  it("discloses and refuses conflicting standard registry dependencies", async () => {
    const { artifactPath, root } = await fixture();
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
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
      JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
        .dependencies["standard-dam-client"]
    ).toBe("^1.0.0");
  });

  it("cancels before changing a customer workspace", async () => {
    const { artifactPath, root } = await fixture();
    const target = path.join(root, "packages/cms-drupal/integrations/dam.ts");

    await expect(
      addRegistryItem(
        artifactPath,
        { cwd: root },
        { confirm: async () => false }
      )
    ).rejects.toThrow("Installation cancelled");

    await expect(readFile(target, "utf8")).rejects.toThrow();
  });

  it("installs and checks the complete registry dependency graph", async () => {
    const { artifactPath, root } = await fixture();
    const dependencyPath = path.join(root, "dam-backend.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
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
              "~/apps/drupal-hydra/web/modules/custom/next_hydra_dam/next_hydra_dam.info.yml",
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
      { install: async () => undefined }
    );

    expect(
      await readFile(
        path.join(
          root,
          "apps/drupal-hydra/web/modules/custom/next_hydra_dam/next_hydra_dam.info.yml"
        ),
        "utf8"
      )
    ).toContain("name: Next Hydra DAM");
  });

  it("rejects target collisions in registry dependencies before writing", async () => {
    const { artifactPath, root } = await fixture();
    const dependencyPath = path.join(root, "dam-collision.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
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
    ).rejects.toThrow("targets the same customer file");
    await expect(
      readFile(
        path.join(root, "packages/cms-drupal/integrations/dam.ts"),
        "utf8"
      )
    ).rejects.toThrow();
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

  it("validates a private Provider from its declared stable alias", async () => {
    const { artifactPath, root } = await fixture();
    const providerPath = path.join(root, "private-cms.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.meta.nextHydra.compatibility.requires = ["vendor/cms/private"];
    artifact.registryDependencies = [providerPath];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      providerPath,
      `${JSON.stringify({
        $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
        meta: {
          nextHydra: {
            id: "vendor/cms/private",
            kind: "provider",
            packages: [
              {
                cwd: "apps/web",
                name: "@repo/cms",
                section: "dependencies",
                specifier: "workspace:@vendor/cms-private@*",
              },
            ],
            slot: "cms",
          },
        },
        name: "private-cms",
        type: "registry:item",
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow("requires vendor/cms/private");
  });

  it("does not let a nested Provider switch the customer alias", async () => {
    const { artifactPath, root } = await fixture();
    const providerPath = path.join(root, "nested-drupal-provider.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
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
            id: "next-hydra/cms/drupal",
            kind: "provider",
            packages: [
              {
                cwd: "apps/web",
                name: "@repo/cms",
                section: "dependencies",
                specifier: "workspace:@repo/cms-drupal@*",
              },
            ],
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
      JSON.parse(
        await readFile(path.join(root, "apps/web/package.json"), "utf8")
      ).dependencies["@repo/cms"]
    ).toBe("workspace:@repo/cms-contentstack@*");
    await expect(
      readFile(path.join(root, "packages/cms-drupal/provider.ts"), "utf8")
    ).rejects.toThrow();
  });

  it("installs the exact registry graph that was approved", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "next-hydra-approved-add-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"customer","private":true,"dependencies":{}}\n'
    );
    const artifactPath = path.join(root, "mutable.json");
    const artifact = (content: string) =>
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
    await writeFile(artifactPath, artifact("approved content\n"));

    await addRegistryItem(
      artifactPath,
      { cwd: root },
      {
        confirm: async () => {
          await writeFile(artifactPath, artifact("changed after approval\n"));
          return true;
        },
      }
    );

    expect(await readFile(path.join(root, "src/approved.ts"), "utf8")).toBe(
      "approved content\n"
    );
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
      '{"name":"web","dependencies":{}}\n'
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
          },
        },
        name: "new-package",
        type: "registry:item",
      })}\n`
    );

    await addRegistryItem(
      artifactPath,
      { cwd: root, yes: true },
      { install: async () => undefined }
    );

    expect(
      JSON.parse(
        await readFile(
          path.join(root, "packages/new-package/package.json"),
          "utf8"
        )
      ).dependencies["example-client"]
    ).toBe("^1.0.0");
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
      readFile(path.join(root, "packages/invalid/package.json"), "utf8")
    ).rejects.toThrow();
  });
});
