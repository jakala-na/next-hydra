import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { addRegistryItem } from "../src/composition/add.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";

const temporaryDirectories: string[] = [];
const INTERACTIVE_REVIEW_REQUIRED = /must be reviewed interactively/;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "next-hydra-add-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "packages/cms-drupal"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    '{"name":"customer","private":true}\n'
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
            target: "~/integrations/dam.ts",
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
            installUnits: [{ cwd: "packages/cms-drupal", item: "dam-addon" }],
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
  it("creates missing files, skips identical files, and never deletes other code", async () => {
    const { root, artifactPath } = await fixture();
    const unrelated = path.join(root, "customer-owned.ts");
    await writeFile(unrelated, "keep me\n");

    await addRegistryItem(artifactPath, { cwd: root, yes: true });
    await addRegistryItem(artifactPath, { cwd: root, yes: true });

    expect(
      await readFile(
        path.join(root, "packages/cms-drupal/integrations/dam.ts"),
        "utf8"
      )
    ).toBe("export const dam = true;\n");
    expect(await readFile(unrelated, "utf8")).toBe("keep me\n");
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
    ).rejects.toThrow(INTERACTIVE_REVIEW_REQUIRED);
    expect(await readFile(target, "utf8")).toBe("customer improvement\n");
  });

  it("discloses and refuses conflicting standard registry dependencies", async () => {
    const { artifactPath, root } = await fixture();
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.dependencies = ["standard-dam-client@^2.0.0"];
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(
      path.join(root, "packages/cms-drupal/package.json"),
      `${JSON.stringify({
        dependencies: { "standard-dam-client": "^1.0.0" },
        name: "@repo/cms-drupal",
        private: true,
      })}\n`
    );

    await expect(
      addRegistryItem(artifactPath, { cwd: root, yes: true })
    ).rejects.toThrow(INTERACTIVE_REVIEW_REQUIRED);
    expect(
      JSON.parse(
        await readFile(
          path.join(root, "packages/cms-drupal/package.json"),
          "utf8"
        )
      ).dependencies["standard-dam-client"]
    ).toBe("^1.0.0");
  });

  it("overrides an Install Unit root for a reorganized customer workspace", async () => {
    const { artifactPath, root } = await fixture();
    const customRoot = path.join(root, "packages/customer-cms");
    await mkdir(customRoot, { recursive: true });
    await writeFile(
      path.join(customRoot, "package.json"),
      '{"name":"@customer/cms","dependencies":{}}\n'
    );

    await addRegistryItem(artifactPath, {
      cwd: root,
      roots: ["dam-addon=packages/customer-cms"],
      yes: true,
    });

    expect(
      await readFile(path.join(customRoot, "integrations/dam.ts"), "utf8")
    ).toBe("export const dam = true;\n");
    await expect(
      readFile(
        path.join(root, "packages/cms-drupal/integrations/dam.ts"),
        "utf8"
      )
    ).rejects.toThrow();
  });
});
