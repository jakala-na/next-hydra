import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertLintCoverage,
  generateLintRouteTypes,
  lintSourceLocation,
  selectLintTargets,
  lintWorkspaceFiles,
} from "../src/composition-lint.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { runGit } from "../src/git.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");
const executable = path.join(sourceRoot, "node_modules/.bin/oxlint");

describe("real lint verification", () => {
  const temporary: string[] = [];
  afterEach(async () => {
    await Promise.all(
      temporary.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  async function fixture(ignorePatterns: string[] = []) {
    const root = await mkdtemp(
      path.join(sourceRoot, "workspaces", ".lint-test-")
    );
    temporary.push(root);
    await runGit(["init", "--quiet"], {
      cwd: root,
      env: {
        ...process.env,
        GIT_COMMON_DIR: undefined,
        GIT_DIR: undefined,
        GIT_INDEX_FILE: undefined,
        GIT_WORK_TREE: undefined,
      },
    });
    await writeJsonFile(path.join(root, ".oxlintrc.json"), {
      ignorePatterns,
      options: { typeAware: true },
      plugins: ["typescript"],
      rules: { "typescript/no-unsafe-call": "error" },
    });
    await writeJsonFile(path.join(root, "tsconfig.json"), {
      compilerOptions: { noEmit: true, strict: true, types: [] },
      include: ["*.ts"],
    });
    return root;
  }

  async function routeFixture(segment: string) {
    const root = await fixture();
    await symlink(
      path.join(sourceRoot, "apps/web/node_modules"),
      path.join(root, "node_modules")
    );
    await mkdir(path.join(root, "app", segment), { recursive: true });
    await writeFile(
      path.join(root, "app", segment, "layout.tsx"),
      "export default function Layout({children}) { return <html><body>{children}</body></html>; }\n"
    );
    const configuration =
      'throw new Error("Provider credentials must not be loaded for route types");\nexport default {};\n';
    await writeFile(path.join(root, "next.config.ts"), configuration);
    return { configuration, root };
  }

  it("generates real root-param types and restores the composed config", async () => {
    const { root, configuration } = await routeFixture("[locale]");
    await generateLintRouteTypes(root);
    await expect(
      readFile(path.join(root, ".next/types/root-params.d.ts"), "utf-8")
    ).resolves.toContain("locale(): Promise<string>");
    await expect(
      readFile(path.join(root, "next.config.ts"), "utf-8")
    ).resolves.toBe(configuration);
  });

  it("restores the composed config when Next rejects an invalid tsconfig", async () => {
    const { root, configuration } = await routeFixture("[locale]");
    await writeFile(path.join(root, "tsconfig.json"), '{"compilerOptions":');
    await expect(generateLintRouteTypes(root)).rejects.toThrow(
      "Command failed:"
    );
    await expect(
      readFile(path.join(root, "next.config.ts"), "utf-8")
    ).resolves.toBe(configuration);
  });

  it("checks real physical files below an ignored workspace folder", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "good.ts"),
      "export const value: string = 'valid';\n"
    );
    await expect(
      lintWorkspaceFiles(root, executable, ["good.ts"], [])
    ).resolves.toBe(0);
  });

  it("reports real unsafe calls instead of accepting successful discovery alone", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "bad.ts"),
      "export function call(value: any) { value(); }\n"
    );
    await expect(
      lintWorkspaceFiles(root, executable, ["bad.ts"], [])
    ).resolves.toBeGreaterThan(0);
  });

  it("rejects a configuration that hides a requested file", async () => {
    const root = await fixture(["hidden.ts"]);
    await writeFile(path.join(root, "good.ts"), "export const value = 1;\n");
    await writeFile(path.join(root, "hidden.ts"), "export const hidden = 2;\n");
    await expect(
      lintWorkspaceFiles(root, executable, ["good.ts", "hidden.ts"], [])
    ).rejects.toThrow("Lint did not inspect expected files");
  });
});

describe("composition lint coverage", () => {
  const origins = [
    {
      origin: {
        kind: "template",
        path: "apps/web/registry/layout.tsx.template",
      },
      target: "apps/web/layout.tsx",
    },
    {
      origin: { kind: "source", path: "packages/auth/registry/account.tsx" },
      target: "apps/web/account.tsx",
    },
    {
      origin: { kind: "source", path: "packages/cms/page.tsx" },
      target: "packages/cms/page.tsx",
    },
    {
      origin: { kind: "source", path: "apps/web/package.json" },
      target: "apps/web/package.json",
    },
  ] as const;

  it("checks rendered templates and maps relocated source files", () => {
    expect(
      selectLintTargets(
        origins,
        new Set(["packages/auth/registry/account.tsx"])
      )
    ).toEqual(["apps/web/layout.tsx", "apps/web/account.tsx"]);
  });

  it("rejects incomplete coverage instead of accepting a successful empty check", () => {
    expect(() => {
      assertLintCoverage(["layout.tsx", "account.tsx"], ["layout.tsx"]);
    }).toThrow("account.tsx");
  });

  it("accepts complete coverage independent of discovery order", () => {
    expect(() => {
      assertLintCoverage(
        ["layout.tsx", "account.tsx"],
        ["account.tsx", "layout.tsx"]
      );
    }).not.toThrow();
  });

  it("reports the template and rendered target without pretending their line numbers match", () => {
    expect(lintSourceLocation("apps/web/layout.tsx", origins)).toBe(
      "apps/web/registry/layout.tsx.template (rendered apps/web/layout.tsx)"
    );
  });

  it("reports canonical locations for provider-owned files", () => {
    expect(lintSourceLocation("apps/web/account.tsx", origins)).toBe(
      "packages/auth/registry/account.tsx"
    );
  });
});
