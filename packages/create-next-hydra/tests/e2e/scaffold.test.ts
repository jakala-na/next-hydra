import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pathExists } from "../../src/fs-utils.js";
import { scaffoldProject } from "../../src/scaffold.js";

const run = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const E2E_TIMEOUT = 240_000;
const INCOMPATIBLE_DRUPAL_ADD_ON = /requires next-hydra\/cms\/drupal/;
const PARTIAL_PROJECT_PRESERVED =
  /partial project has been left exactly as it stands/;
const WORKOS_SETUP_INSTRUCTION_PREFIX =
  "Configure separate WorkOS projects for the customer web app and admin app";
let testRoot: string;
let sourceRepository: string;

function occurrenceCount(source: string, value: string): number {
  return source.split(value).length - 1;
}

async function createSourceRepository(): Promise<string> {
  const source = path.join(testRoot, "source");
  await mkdir(source, { recursive: true });
  const { stdout } = await run(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: repoRoot }
  );
  await Promise.all(
    stdout
      .split("\n")
      .filter(Boolean)
      .map(async (relativePath) => {
        const sourcePath = path.join(repoRoot, relativePath);
        if (!(await pathExists(sourcePath))) {
          return;
        }
        const target = path.join(source, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(sourcePath, target);
      })
  );
  const rootRegistryPath = path.join(source, "registry.json");
  const rootRegistry = JSON.parse(await readFile(rootRegistryPath, "utf-8"));
  rootRegistry.include.push("fixtures/drupal-commerce-dam/registry.json");
  await writeFile(
    rootRegistryPath,
    `${JSON.stringify(rootRegistry, null, 2)}\n`
  );
  const addOnRoot = path.join(source, "fixtures/drupal-commerce-dam");
  await mkdir(addOnRoot, { recursive: true });
  await writeFile(
    path.join(addOnRoot, "frontend.ts"),
    "export const drupalCommerceDam = true;\n"
  );
  await writeFile(
    path.join(addOnRoot, "next_hydra_dam.info.yml"),
    "name: Next Hydra DAM\ntype: module\ncore_version_requirement: ^11\n"
  );
  await writeFile(
    path.join(addOnRoot, "registry.json"),
    `${JSON.stringify(
      {
        $schema:
          "https://raw.githubusercontent.com/jakala-na/next-hydra/main/packages/create-next-hydra/schema/source-registry.json",
        items: [
          {
            $schema:
              "https://raw.githubusercontent.com/jakala-na/next-hydra/main/packages/create-next-hydra/schema/selection-definition.json",
            files: [
              {
                path: "frontend.ts",
                target: "~/packages/cms-drupal/integrations/dam.ts",
                type: "registry:file",
              },
            ],
            meta: {
              nextHydra: {
                compatibility: {
                  conflicts: [],
                  requires: [
                    "next-hydra/cms/drupal",
                    "next-hydra/commerce/commercetools",
                  ],
                },
                id: "fixture/add-on/drupal-commerce-dam",
                kind: "add-on",
                packages: [
                  {
                    cwd: "packages/cms-drupal",
                    name: "nanoid",
                    section: "dependencies",
                    specifier: "^5.1.6",
                  },
                ],
              },
            },
            name: "drupal-commerce-dam",
            registryDependencies: [
              "jakala-na/next-hydra/cms-drupal",
              "jakala-na/next-hydra/drupal-dam-module",
            ],
            type: "registry:item",
          },
          {
            files: [
              {
                path: "next_hydra_dam.info.yml",
                target:
                  "~/apps/drupal/docroot/modules/custom/next_hydra_dam/next_hydra_dam.info.yml",
                type: "registry:file",
              },
            ],
            name: "drupal-dam-module",
            type: "registry:item",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  await run("git", ["init"], { cwd: source });
  await run("git", ["add", "-A"], { cwd: source });
  await run(
    "git",
    [
      "-c",
      "user.name=Next Hydra Test",
      "-c",
      "user.email=test@next-hydra.invalid",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: source }
  );
  return source;
}

const fakeRootInstall = async (cwd: string) => {
  await writeFile(path.join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
};

const installApplicationWorkspaces = async (cwd: string): Promise<void> => {
  await run(
    "pnpm",
    [
      "install",
      "--filter",
      "admin...",
      "--filter",
      "web...",
      "--filter",
      "api...",
      "--filter",
      "cli...",
    ],
    { cwd }
  );
};

const typecheckEnvironment = () => ({
  ...process.env,
  ADMIN_CLERK_AUTHORIZED_PARTIES: "http://localhost:3005",
  ADMIN_CLERK_PUBLISHABLE_KEY: "pk_test_admin_publishable",
  ADMIN_CLERK_SECRET_KEY: "sk_test_admin_secret",
  ADMIN_URL: "http://localhost:3005",
  ADMIN_WORKOS_API_KEY: "sk_test_admin",
  ADMIN_WORKOS_CLIENT_ID: "client_test_admin",
  CLERK_AUTHORIZED_PARTIES: "http://localhost:3001",
  CLERK_SECRET_KEY: "sk_test_secret",
  CLERK_WEBHOOK_SECRET: "whsec_test",
  COMMERCETOOLS_CLIENT_ID: "test-client",
  COMMERCETOOLS_CLIENT_SECRET: "test-secret",
  COMMERCETOOLS_PROJECT_KEY: "test-project",
  COMMERCETOOLS_REGION: "test-region",
  COMMERCETOOLS_SCOPE: "test-scope",
  CONTENTSTACK_API_KEY: "test-api-key",
  CONTENTSTACK_DELIVERY_TOKEN: "cs-test-delivery",
  CONTENTSTACK_ENVIRONMENT: "test",
  CONTENTSTACK_PREVIEW_TOKEN: "cs-test-preview",
  CONTENTSTACK_WEBHOOK_SECRET: "test-webhook-secret",
  DRUPAL_BASE_URL: "https://drupal.example.com",
  DRUPAL_PREVIEWER_CLIENT_ID: "test-preview-client",
  DRUPAL_PREVIEWER_CLIENT_SECRET: "test-preview-secret",
  DRUPAL_VIEWER_CLIENT_ID: "test-viewer-client",
  DRUPAL_VIEWER_CLIENT_SECRET: "test-viewer-secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_publishable",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
  NEXT_PUBLIC_CONTENTSTACK_API_KEY: "test-api-key",
  NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: "test",
  NEXT_PUBLIC_POSTHOG_HOST: "https://posthog.example.com",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
  NEXT_PUBLIC_WEB_URL: "http://localhost:3001",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3001/api/auth/callback",
  REGISTRATION_APPROVER_EMAIL: "approver@example.com",
  RESEND_FROM: "test@example.com",
  RESEND_TOKEN: "re_test",
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "test-cookie-password-at-least-32-characters",
  WORKOS_WEBHOOK_SECRET: "whsec_test",
});

const runTypecheck = async (
  cwd: string,
  args: readonly string[],
  description: string
): Promise<void> => {
  const env = typecheckEnvironment();

  try {
    await run("pnpm", [...args], { cwd, env });
  } catch (error) {
    const failure = error as {
      code?: number;
      signal?: string;
      stderr?: string;
      stdout?: string;
    };
    throw new Error(
      [
        `${description} failed with code ${failure.code ?? "unknown"}${
          failure.signal ? ` and signal ${failure.signal}` : ""
        }`,
        failure.stdout?.trim(),
        failure.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
      { cause: error }
    );
  }
};

const typecheckApplications = async (cwd: string) => {
  await runTypecheck(
    cwd,
    [
      "exec",
      "turbo",
      "run",
      "typecheck",
      "--filter=admin",
      "--filter=web",
      "--filter=api",
      "--filter=cli",
    ],
    "application typecheck"
  );
};

const testCustomerInvitationComposition = async (target: string) => {
  await Promise.all([
    runTypecheck(
      target,
      [
        "--filter",
        "web",
        "exec",
        "vitest",
        "run",
        "lib/customer-account-invitation-composition.test.ts",
      ],
      "customer-account invitation issuance composition test"
    ),
    runTypecheck(
      target,
      [
        "--filter",
        "api",
        "exec",
        "vitest",
        "run",
        "lib/company-member-invitation-composition.test.ts",
      ],
      "company-member invitation acceptance composition test"
    ),
  ]);
};

function options(
  targetDir: string,
  cms: "drupal" | "contentstack",
  auth: "clerk" | "workos" = "workos"
) {
  return {
    auth,
    cms,
    commerce: "commercetools",
    commit: false,
    repoUrl: pathToFileURL(sourceRepository).href,
    skipGit: true,
    targetDir,
    verbose: false,
    yes: true,
  };
}

beforeAll(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), "next-hydra-scaffold-"));
  sourceRepository = await createSourceRepository();
});

afterAll(async () => {
  await rm(testRoot, { force: true, recursive: true });
}, E2E_TIMEOUT);

describe("scaffold composition", () => {
  it(
    "prints Provider instructions only in the final setup section",
    async () => {
      const target = path.join(testRoot, "quiet-shadcn-project");
      const stderrOutput: string[] = [];
      const stdoutOutput: string[] = [];
      const consoleOutput: string[] = [];
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation((...values: unknown[]) => {
          consoleOutput.push(values.map(String).join(" "));
        });
      const stderrWriteSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          stderrOutput.push(String(chunk));
          return true;
        });
      const stdoutWriteSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          stdoutOutput.push(String(chunk));
          return true;
        });

      try {
        await scaffoldProject(options(target, "contentstack"), {
          install: fakeRootInstall,
        });
      } finally {
        consoleLogSpy.mockRestore();
        stderrWriteSpy.mockRestore();
        stdoutWriteSpy.mockRestore();
      }

      expect(stderrOutput.join("")).not.toContain(
        "Added the following variables to"
      );
      expect(
        occurrenceCount(
          `${consoleOutput.join("\n")}\n${stdoutOutput.join("")}`,
          WORKOS_SETUP_INSTRUCTION_PREFIX
        )
      ).toBe(1);
      await rm(target, { force: true, recursive: true });
    },
    E2E_TIMEOUT
  );

  it(
    "reconstructs both CMS variants from the Baseline and selected registry items",
    async () => {
      const contentstackTarget = path.join(testRoot, "contentstack-project");
      await scaffoldProject(options(contentstackTarget, "contentstack"), {
        install: installApplicationWorkspaces,
      });
      await typecheckApplications(contentstackTarget);
      await testCustomerInvitationComposition(contentstackTarget);

      await expect(
        pathExists(
          path.join(
            contentstackTarget,
            "packages/cms-contentstack/package.json"
          )
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(contentstackTarget, "packages/cms-drupal"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(
          path.join(
            contentstackTarget,
            "patches/@drupal-canvas__headless.patch"
          )
        )
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(contentstackTarget, "apps/drupal"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(
          path.join(contentstackTarget, "packages/auth-workos/package.json")
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(
          path.join(
            contentstackTarget,
            "packages/commerce-commercetools/package.json"
          )
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(contentstackTarget, "next-hydra.json"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(contentstackTarget, "pnpm-lock.yaml"))
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(contentstackTarget, "registry.json"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(
          path.join(contentstackTarget, "packages/cms-contentstack/registry")
        )
      ).resolves.toBeFalsy();
      await expect(
        pathExists(
          path.join(
            contentstackTarget,
            "packages/cms-contentstack/registry.json"
          )
        )
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(contentstackTarget, "packages/create-next-hydra"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(
          path.join(
            contentstackTarget,
            "apps/web/app/api/canvas/components/route.ts"
          )
        )
      ).resolves.toBeFalsy();
      await expect(
        readFile(
          path.join(contentstackTarget, "apps/web/app/api/draft/route.ts"),
          "utf-8"
        )
      ).resolves.toContain('export { GET } from "@repo/cms/routes/draft";');

      const contentstackWeb = JSON.parse(
        await readFile(
          path.join(contentstackTarget, "apps/web/package.json"),
          "utf-8"
        )
      );
      expect(contentstackWeb.dependencies["@repo/cms"]).toBe(
        "workspace:@repo/cms-contentstack@*"
      );
      expect(contentstackWeb.dependencies["@repo/auth"]).toBe(
        "workspace:@repo/auth-workos@*"
      );
      expect(contentstackWeb.dependencies["@repo/commerce-provider"]).toBe(
        "workspace:@repo/commerce-commercetools@*"
      );
      await rm(contentstackTarget, { force: true, recursive: true });

      const drupalTarget = path.join(testRoot, "drupal-project");
      await scaffoldProject(options(drupalTarget, "drupal"), {
        install: installApplicationWorkspaces,
      });
      await typecheckApplications(drupalTarget);
      await expect(
        pathExists(path.join(drupalTarget, "packages/cms-drupal/package.json"))
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(drupalTarget, "packages/cms-contentstack"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(drupalTarget, "apps/drupal/composer.json"))
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(drupalTarget, "apps/drupal/LICENSE.txt"))
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(drupalTarget, "apps/drupal/docroot/index.php"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(drupalTarget, "apps/drupal/.lando.local.yml"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(
          path.join(drupalTarget, "patches/@drupal-canvas__headless.patch")
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(
          path.join(drupalTarget, "apps/web/app/api/canvas/components/route.ts")
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(drupalTarget, "packages/cms-drupal/registry"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(drupalTarget, "packages/cms-drupal/registry.json"))
      ).resolves.toBeFalsy();

      const asset =
        "apps/drupal/recipes/next-hydra-starter/content/file/next-hydra-hero.webp";
      const hash = (content: Uint8Array) =>
        createHash("sha256").update(content).digest("hex");
      expect(hash(await readFile(path.join(drupalTarget, asset)))).toBe(
        hash(await readFile(path.join(repoRoot, asset)))
      );
      await rm(drupalTarget, { force: true, recursive: true });

      const presetTarget = path.join(testRoot, "preset-project");
      await scaffoldProject(
        {
          commit: false,
          preset: "standard",
          repoUrl: pathToFileURL(sourceRepository).href,
          skipGit: true,
          targetDir: presetTarget,
          verbose: false,
          yes: true,
        },
        { install: fakeRootInstall }
      );
      await expect(
        pathExists(path.join(presetTarget, "packages/cms-drupal/package.json"))
      ).resolves.toBeTruthy();
    },
    E2E_TIMEOUT
  );

  it(
    "installs and typechecks the generated Clerk application composition",
    async () => {
      const target = path.join(testRoot, "clerk-project");
      await scaffoldProject(options(target, "contentstack", "clerk"), {
        install: installApplicationWorkspaces,
      });
      await typecheckApplications(target);
      await testCustomerInvitationComposition(target);

      await expect(
        Promise.all([
          pathExists(path.join(target, "packages/auth-clerk/package.json")),
          pathExists(path.join(target, "packages/auth-workos")),
          pathExists(path.join(target, "apps/admin/app/sign-in/page.tsx")),
          pathExists(path.join(target, "apps/admin/app/sign-out/page.tsx")),
          pathExists(
            path.join(target, "apps/api/app/api/webhooks/clerk/route.ts")
          ),
          pathExists(
            path.join(
              target,
              "apps/web/app/accept-invitation/[[...accept-invitation]]/page.tsx"
            )
          ),
        ])
      ).resolves.toStrictEqual([true, false, true, true, true, true]);

      await expect(
        readFile(path.join(target, "apps/admin/package.json"), "utf-8")
      ).resolves.toContain('"@repo/auth": "workspace:@repo/auth-clerk@*"');
      await expect(
        readFile(path.join(target, "apps/web/package.json"), "utf-8")
      ).resolves.toContain('"@repo/auth": "workspace:@repo/auth-clerk@*"');
      await expect(
        readFile(path.join(target, "apps/api/package.json"), "utf-8")
      ).resolves.toContain('"@repo/auth": "workspace:@repo/auth-clerk@*"');
      await expect(
        readFile(path.join(target, "apps/cli/package.json"), "utf-8")
      ).resolves.toContain('"@repo/auth": "workspace:@repo/auth-clerk@*"');

      await rm(target, { force: true, recursive: true });
    },
    E2E_TIMEOUT
  );

  it(
    "materializes a compatible cross-workspace Add-on and rejects it for another CMS before writes",
    async () => {
      const target = path.join(testRoot, "add-on-project");
      await scaffoldProject(
        {
          ...options(target, "drupal"),
          addOns: ["drupal-commerce-dam"],
        },
        { install: fakeRootInstall }
      );

      await expect(
        readFile(
          path.join(target, "packages/cms-drupal/integrations/dam.ts"),
          "utf-8"
        )
      ).resolves.toBe("export const drupalCommerceDam = true;\n");
      await expect(
        pathExists(
          path.join(
            target,
            "apps/drupal/docroot/modules/custom/next_hydra_dam/next_hydra_dam.info.yml"
          )
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(
          path.join(target, "apps/web/app/api/canvas/components/route.ts")
        )
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(target, "packages/cms-drupal/registry"))
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(target, "packages/cms-drupal/registry.json"))
      ).resolves.toBeFalsy();
      const drupalPackage = JSON.parse(
        await readFile(
          path.join(target, "packages/cms-drupal/package.json"),
          "utf-8"
        )
      );
      expect(drupalPackage.dependencies.nanoid).toBe("^5.1.6");
      await rm(target, { force: true, recursive: true });

      const incompatibleTarget = path.join(testRoot, "incompatible-add-on");
      await expect(
        scaffoldProject({
          ...options(incompatibleTarget, "contentstack"),
          addOns: ["drupal-commerce-dam"],
        })
      ).rejects.toThrow(INCOMPATIBLE_DRUPAL_ADD_ON);
      await expect(pathExists(incompatibleTarget)).resolves.toBeFalsy();
    },
    E2E_TIMEOUT
  );

  it(
    "preserves a failed scaffold for inspection",
    async () => {
      const target = path.join(testRoot, "failed-project");
      await expect(
        scaffoldProject(options(target, "contentstack"), {
          install: async () => {
            throw new Error("forced package-manager failure");
          },
        })
      ).rejects.toThrow(PARTIAL_PROJECT_PRESERVED);

      await expect(pathExists(target)).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(target, "apps/web/package.json"))
      ).resolves.toBeTruthy();
      await expect(
        pathExists(path.join(target, "pnpm-lock.yaml"))
      ).resolves.toBeTruthy();
      await expect(
        readFile(path.join(target, "apps/web/app/api/draft/route.ts"), "utf-8")
      ).resolves.toContain('export { GET } from "@repo/cms/routes/draft";');
      await expect(
        pathExists(
          path.join(target, "apps/web/app/api/canvas/components/route.ts")
        )
      ).resolves.toBeFalsy();
      await expect(
        pathExists(path.join(target, "packages/cms-contentstack/registry"))
      ).resolves.toBeFalsy();
    },
    E2E_TIMEOUT
  );
});
