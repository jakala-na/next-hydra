import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { composeWorkspace } from "../src/compose.js";
import { readPackageJson } from "../src/composition/packages.js";
import { workspaceDefinitionSchema } from "../src/development-workspaces.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { runCommand, runGit } from "../src/git.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");

async function createCustomer(name: string, target: string) {
  const definition = workspaceDefinitionSchema.parse(
    JSON.parse(
      await readFile(
        path.join(sourceRoot, "workspaces", name, "next-hydra.json"),
        "utf-8"
      )
    )
  );
  await composeWorkspace(
    target,
    {
      addOns: definition.addOns,
      auth: definition.providers.auth,
      cms: definition.providers.cms ?? "contentstack",
      commerce: definition.providers.commerce,
      install: false,
    },
    { sourceRoot }
  );
  return definition;
}

describe("copied customer workspace", () => {
  let scratch: string;
  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "copied-workspace-test-"));
  });
  afterEach(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it.each([
    "cms-contentstack",
    "cms-drupal",
    "storefront-contentstack",
    "storefront-drupal",
  ])(
    "%s materializes physical applications without maintainer state or source links",
    async (name) => {
      const target = path.join(scratch, "application");
      const { providers } = await createCustomer(name, target);
      const entries = await readdir(target, {
        recursive: true,
        withFileTypes: true,
      });
      const paths = new Set(
        entries.map((entry) =>
          path.relative(target, path.join(entry.parentPath, entry.name))
        )
      );
      const web = await readPackageJson(
        path.join(target, "apps/web/package.json")
      );
      expect({
        definition: paths.has("next-hydra.json"),
        layout: paths.has("apps/web/app/[locale]/layout.tsx"),
        links: entries.filter((entry) => entry.isSymbolicLink()).length,
        maintainerCli: paths.has("packages/create-next-hydra"),
        portless: web.portless,
        receipt: paths.has(".workspace-composition.json"),
        vercel: [...paths].some((file) => file.endsWith("/vercel.json")),
      }).toEqual({
        definition: false,
        layout: true,
        links: 0,
        maintainerCli: false,
        portless: { name: "web.application", script: "dev:app" },
        receipt: false,
        vercel: true,
      });
      const hasCommerce = Boolean(providers.commerce);
      const { auth } = providers;
      expect({
        admin: paths.has(
          auth === "clerk"
            ? "apps/admin/app/sign-in/page.tsx"
            : "apps/admin/app/api/auth/callback/route.ts"
        ),
        api: paths.has(`apps/api/app/api/webhooks/${auth}/route.ts`),
        auth: web.dependencies?.["@repo/auth"],
        checkout: paths.has("apps/web/app/[locale]/checkout/page.tsx"),
      }).toEqual({
        admin: hasCommerce,
        api: hasCommerce,
        auth: auth ? `workspace:@repo/auth-${auth}@*` : undefined,
        checkout: hasCommerce,
      });
      const sourceManifest = await readPackageJson(
        path.join(sourceRoot, "package.json")
      );
      const root = await readPackageJson(path.join(target, "package.json"));
      expect(root.devDependencies?.portless).toBe(
        sourceManifest.devDependencies?.portless
      );
      expect(web.scripts).toMatchObject({ dev: "portless" });
      const manifestPath = "packages/design-system/package.json";
      const original = await readFile(
        path.join(sourceRoot, manifestPath),
        "utf-8"
      );
      await writeFile(path.join(target, manifestPath), "{}");
      await expect(
        readFile(path.join(sourceRoot, manifestPath), "utf-8")
      ).resolves.toBe(original);
    },
    30_000
  );

  it("retains customer Vercel defaults and runs their skip-CI commands without maintainer tooling", async () => {
    const target = path.join(scratch, "storefront");
    await createCustomer("storefront-contentstack", target);
    const apps = [
      { name: "web", script: "scripts/skip-ci.js" },
      { name: "api", script: "scripts/skip-ci.js" },
      { name: "admin", script: "scripts/skip-ci.mjs" },
    ];
    await Promise.all(
      apps.map(async (app) => {
        const directory = path.join("apps", app.name);
        const settings = await readFile(
          path.join(target, directory, "vercel.json"),
          "utf-8"
        );
        expect(JSON.parse(settings)).toEqual({
          $schema: "https://openapi.vercel.sh/vercel.json",
          ignoreCommand: `node ${app.script}`,
        });
        await expect(
          readFile(path.join(target, directory, app.script), "utf-8")
        ).resolves.toBe(
          await readFile(path.join(sourceRoot, directory, app.script), "utf-8")
        );
      })
    );
    await runGit(["init", "--quiet"], { cwd: target });
    const commit = [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "-m",
    ];
    await runGit([...commit, "Update storefront [skip ci]"], { cwd: target });
    await Promise.all(
      apps.map(async (app) => {
        await expect(
          runCommand("node", [app.script], {
            cwd: path.join(target, "apps", app.name),
          })
        ).resolves.toEqual({
          stdout: "Skipping build due to [skip ci] in commit message.\n",
          stderr: "",
        });
      })
    );
    await runGit([...commit, "Update storefront"], { cwd: target });
    await Promise.all(
      apps.map(async (app) => {
        await expect(
          runCommand("node", [app.script], {
            cwd: path.join(target, "apps", app.name),
          })
        ).rejects.toMatchObject({
          code: 1,
          stdout: "",
          stderr: "",
        });
      })
    );
  }, 30_000);

  it.each(["storefront-contentstack", "storefront-drupal"])(
    "%s preserves API tunneling and sibling app hosts",
    async (name) => {
      const target = path.join(scratch, "storefront");
      await createCustomer(name, target);
      const [api, admin] = await Promise.all([
        readPackageJson(path.join(target, "apps/api/package.json")),
        readPackageJson(path.join(target, "apps/admin/package.json")),
      ]);
      expect(api).toMatchObject({
        portless: { name: "api.storefront", script: "dev:app" },
        scripts: { dev: "portless", "dev:public": "portless --ngrok" },
      });
      expect(admin).toMatchObject({
        portless: { name: "admin.storefront", script: "dev:app" },
        scripts: { dev: "portless" },
      });
    },
    30_000
  );

  it("runs Drupal's DDEV frontend through workspace Portless with a fixed callback port", async () => {
    const target = path.join(scratch, "drupal");
    await createCustomer("cms-drupal", target);
    const bin = path.join(target, "node_modules/.bin");
    await mkdir(bin, { recursive: true });
    await writeFile(
      path.join(bin, "portless"),
      "#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),systemCA:process.env.NODE_USE_SYSTEM_CA}));\n",
      { mode: 0o755 }
    );
    const command = await runCommand("pnpm", ["run", "dev:web"], {
      cwd: path.join(target, "apps/drupal"),
    });
    expect(command.stdout).toContain(
      JSON.stringify({
        args: [
          "run",
          "--app-port",
          "3001",
          "next",
          "dev",
          "--turbopack",
          "--hostname",
          "0.0.0.0",
        ],
        cwd: path.join(target, "apps/web"),
        systemCA: "1",
      })
    );
  }, 30_000);

  it.each([
    { hostname: "shop-example-store", name: "Shop.Example_Store" },
    {
      hostname: `${"store-".repeat(10)}sto`,
      name: `${"store-".repeat(12)}long-name`,
    },
  ])(
    "keeps $name in a single DNS label for sibling application URLs",
    async ({ name, hostname }) => {
      const target = path.join(scratch, name);
      await createCustomer("cms-contentstack", target);
      await expect(
        readPackageJson(path.join(target, "apps/web/package.json"))
      ).resolves.toMatchObject({
        portless: { name: `web.${hostname}`, script: "dev:app" },
      });
      await expect(
        readFile(path.join(target, "apps/web/.env.example"), "utf-8")
      ).resolves.toContain(
        `NEXT_PUBLIC_WEB_URL=https://web.${hostname}.localhost`
      );
    },
    30_000
  );

  it("rejects existing customer destinations without replacing files", async () => {
    const target = path.join(scratch, "existing");
    await mkdir(target);
    await writeFile(path.join(target, "keep.txt"), "local work");
    await expect(createCustomer("cms-contentstack", target)).rejects.toThrow(
      "Refusing to replace an existing workspace"
    );
    await expect(
      readFile(path.join(target, "keep.txt"), "utf-8")
    ).resolves.toBe("local work");
  });

  it("rejects a missing package requirement target before creating any output", async () => {
    const registry = path.join(scratch, "invalid.json");
    const target = path.join(scratch, "invalid-output");
    await writeJsonFile(registry, {
      $schema:
        "https://raw.githubusercontent.com/jakala-na/next-hydra/main/packages/create-next-hydra/schema/selection-definition.json",
      files: [
        {
          content: "export const feature = true;",
          path: "feature.ts",
          target: "~/feature.ts",
          type: "registry:file",
        },
      ],
      meta: {
        nextHydra: {
          id: "test/add-on/missing-package",
          kind: "add-on",
          packages: [
            {
              cwd: "apps/missing",
              name: "nanoid",
              section: "dependencies",
              specifier: "^5.1.6",
            },
          ],
        },
      },
      name: "invalid-dependency-target",
      type: "registry:item",
    });
    await expect(
      composeWorkspace(
        target,
        { addOns: [registry], cms: "contentstack", install: false },
        { sourceRoot }
      )
    ).rejects.toThrow("apps/missing/package.json");
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await composeWorkspace(
      target,
      { cms: "contentstack", install: false },
      { sourceRoot }
    );
    await expect(lstat(path.join(target, "feature.ts"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 30_000);
});
