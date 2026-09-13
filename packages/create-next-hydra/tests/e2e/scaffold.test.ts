/* oxlint-disable vitest/max-expects -- Verify the complete owned/excluded file graph from each expensive scaffold; keep these assertions together rather than repeat scaffolding. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { parse } from "jsonc-parser";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { updateDevelopmentWorkspace } from "../../src/development-workspaces.js";
import { pathExists, readJsonFile } from "../../src/fs-utils.js";
import { scaffoldProject } from "../../src/scaffold.js";

// oxlint-disable-next-line typescript/strict-void-return -- Node explicitly supports promisifying execFile; its ChildProcess return is separate from its completion callback.
const run = promisify(execFile);
const scaffoldManifestSchema = z.object({
  dependencies: z.record(z.string()).default({}),
  devDependencies: z.record(z.string()).optional(),
  portless: z
    .object({ name: z.string().optional(), script: z.string().optional() })
    .optional(),
  scripts: z.record(z.string()).optional(),
});
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const E2E_TIMEOUT = 240_000;
const hash = (content: Uint8Array) =>
  createHash("sha256").update(content).digest("hex");
const INCOMPATIBLE_DRUPAL_ADD_ON = /requires next-hydra\/cms\/drupal/u;
const PARTIAL_PROJECT_PRESERVED =
  /partial project has been left exactly as it stands/u;
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
  const rootRegistry = await readJsonFile(
    rootRegistryPath,
    z.object({ include: z.array(z.string()) }).passthrough()
  );
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

const installWorkspace = async (cwd: string): Promise<void> => {
  await run("pnpm", ["install"], { cwd });
};

const workspaceEnvironment = (nodeEnv: "test" | "production") => ({
  // Preserve process essentials, not live provider credentials or test-runner NODE_ENV.
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      [
        "PATH",
        "HOME",
        "USERPROFILE",
        "SystemRoot",
        "TMPDIR",
        "TMP",
        "TEMP",
        "LANG",
        "NODE_EXTRA_CA_CERTS",
        "SSL_CERT_FILE",
      ].includes(name)
    )
  ),
  ADMIN_CLERK_AUTHORIZED_PARTIES: "https://admin.customer-project.localhost",
  ADMIN_CLERK_PUBLISHABLE_KEY: "pk_test_admin_publishable",
  ADMIN_CLERK_SECRET_KEY: "sk_test_admin_secret",
  ADMIN_URL: "https://admin.customer-project.localhost",
  ADMIN_WORKOS_API_KEY: "sk_test_admin",
  ADMIN_WORKOS_CLIENT_ID: "client_test_admin",
  CI: "1",
  CLERK_AUTHORIZED_PARTIES: "https://web.customer-project.localhost",
  CLERK_SECRET_KEY: "sk_test_secret",
  CLERK_WEBHOOK_SECRET: "whsec_test",
  COMMERCETOOLS_CLIENT_ID: "test-client",
  COMMERCETOOLS_CLIENT_SECRET: "test-secret",
  COMMERCETOOLS_PROJECT_KEY: "test-project",
  COMMERCETOOLS_REGION: "test-region",
  COMMERCETOOLS_SCOPE: "manage_project:test-project",
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
  NEXT_PUBLIC_API_URL: "https://api.customer-project.localhost",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_publishable",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
  NEXT_PUBLIC_CONTENTSTACK_API_KEY: "test-api-key",
  NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: "test",
  NEXT_PUBLIC_POSTHOG_HOST: "https://posthog.example.com",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
  NEXT_PUBLIC_WEB_URL: "https://web.customer-project.localhost",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI:
    "https://web.customer-project.localhost/api/auth/callback",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: nodeEnv,
  REGISTRATION_APPROVER_EMAIL: "approver@example.com",
  RESEND_FROM: "test@example.com",
  RESEND_TOKEN: "re_test",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  TURBO_TELEMETRY_DISABLED: "1",
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "test-cookie-password-at-least-32-characters",
  WORKOS_WEBHOOK_SECRET: "whsec_test",
});

const runWorkspaceCommand = async (
  cwd: string,
  args: readonly string[],
  description: string,
  nodeEnv: "test" | "production" = "test"
): Promise<string> => {
  const env = workspaceEnvironment(nodeEnv);

  try {
    const { stdout } = await run("pnpm", [...args], {
      cwd,
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const parsed = z
      .object({
        code: z.union([z.number(), z.string()]).optional(),
        signal: z.string().nullable().optional(),
        stderr: z.string().optional(),
        stdout: z.string().optional(),
      })
      .safeParse(error);
    const failure = parsed.success ? parsed.data : {};
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

const typecheckWorkspace = async (cwd: string) => {
  await runWorkspaceCommand(
    cwd,
    ["run", "typecheck", "--continue=always"],
    "workspace typecheck"
  );
};

const runDocumentedCliHelp = async (target: string) => {
  const readme = await readFile(
    path.join(target, "apps/cli/README.md"),
    "utf-8"
  );
  const command = readme
    .split("\n")
    .find((line) => line.startsWith("pnpm ") && line.endsWith(" --help"));
  if (!command) {
    throw new Error("The installed CLI README must document a help command.");
  }
  return await runWorkspaceCommand(
    target,
    command.split(" ").slice(1),
    "documented CLI help"
  );
};

const testCustomerInvitationComposition = async (target: string) => {
  await Promise.all([
    runWorkspaceCommand(
      target,
      [
        "--filter",
        "web",
        "exec",
        "vitest",
        "run",
        "lib/customer-account-invitation-composition.test.ts",
      ],
      "customer-account invitation lifecycle composition test"
    ),
    runWorkspaceCommand(
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

describe("scaffold composition", () => {
  beforeAll(async () => {
    testRoot = await mkdtemp(path.join(tmpdir(), "next-hydra-scaffold-"));
    sourceRepository = await createSourceRepository();
    // A linked workspace runs against an installed maintainer checkout. Reuse
    // its real dependencies without making standalone customer installs see them.
    const apps = await readdir(path.join(repoRoot, "apps"));
    const packages = await readdir(path.join(repoRoot, "packages"));
    const packageRoots = [
      ".",
      ...apps.map((name) => `apps/${name}`),
      ...packages.map((name) => `packages/${name}`),
    ];
    await Promise.all(
      packageRoots.map(async (relativePath) => {
        const dependencies = path.join(repoRoot, relativePath, "node_modules");
        const fixturePackage = path.join(sourceRepository, relativePath);
        if (
          (await pathExists(dependencies)) &&
          (await pathExists(fixturePackage))
        ) {
          await symlink(
            dependencies,
            path.join(fixturePackage, "node_modules"),
            "dir"
          );
        }
      })
    );
  });

  afterAll(async () => {
    await rm(testRoot, { force: true, recursive: true });
  }, E2E_TIMEOUT);

  it.each(["contentstack", "drupal"])(
    "runs the documented CLI command in its linked %s composition",
    async (cms) => {
      const name = `linked-cli-${cms}`;
      const target = path.join(sourceRepository, "workspaces", name);
      await mkdir(target, { recursive: true });
      await writeFile(
        path.join(target, "next-hydra.json"),
        JSON.stringify({
          addOns: [],
          providers: { cms },
        })
      );
      await updateDevelopmentWorkspace(sourceRepository, name);
      const help = await runDocumentedCliHelp(target);
      expect(help).toContain(
        cms === "drupal"
          ? "Drupal CMS administration commands"
          : "Contentstack CMS administration commands"
      );
      expect(help).not.toContain("Commercetools administration commands");
    },
    E2E_TIMEOUT
  );

  it.each(["contentstack", "drupal"] as const)(
    "typechecks a standalone %s CMS-only customer workspace including all packages",
    async (cms) => {
      const target = path.join(testRoot, `cms-only-${cms}-customer`);
      await scaffoldProject(
        {
          ...options(target, cms),
          auth: undefined,
          commerce: undefined,
          without: ["auth", "commerce"],
        },
        { install: installWorkspace }
      );
      await typecheckWorkspace(target);
      const help = await runDocumentedCliHelp(target);
      expect(help).toContain(
        cms === "drupal"
          ? "Drupal CMS administration commands"
          : "Contentstack CMS administration commands"
      );
    },
    E2E_TIMEOUT
  );

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
    "drops unselected provider patches before installing dependencies",
    async () => {
      const target = path.join(testRoot, "contentstack-patches-project");

      await scaffoldProject(options(target, "contentstack"), {
        install: async (cwd) => {
          const workspaceConfig = await readFile(
            path.join(cwd, "pnpm-workspace.yaml"),
            "utf-8"
          );

          expect(workspaceConfig).not.toContain(
            '"@drupal-canvas/workbench@0.10.0"'
          );
          expect(workspaceConfig).toContain(
            '"@contentstack/cli-cm-import@2.0.0"'
          );
          await fakeRootInstall(cwd);
        },
      });

      await rm(target, { force: true, recursive: true });
    },
    E2E_TIMEOUT
  );

  it(
    "strips maintainer workflows and release tooling from generated projects",
    async () => {
      const target = path.join(testRoot, "customer-release-project");
      await scaffoldProject(options(target, "contentstack"), {
        install: fakeRootInstall,
      });

      await expect(
        Promise.all([
          pathExists(path.join(target, ".changeset")),
          pathExists(path.join(target, "RELEASING.md")),
          pathExists(
            path.join(target, ".github/workflows/release-create-next-hydra.yml")
          ),
          pathExists(
            path.join(target, ".github/workflows/registry-integrity.yml")
          ),
          pathExists(path.join(target, ".github/workflows/e2e.yml")),
        ])
      ).resolves.toStrictEqual([false, false, false, false, false]);

      const packageJson = await readJsonFile(
        path.join(target, "package.json"),
        scaffoldManifestSchema
      );
      const maintainerScripts = [
        "changeset",
        "changeset:status",
        "publish:cli",
        "registry:check",
        "registry:sync",
        "version:cli",
      ].filter((name) => packageJson.scripts?.[name] !== undefined);
      expect(maintainerScripts).toStrictEqual([]);
      expect(packageJson.scripts).toMatchObject({
        build: "turbo run build",
        dev: "turbo run dev",
        test: "turbo run test",
        typecheck: "turbo run typecheck",
      });

      const [
        apiPackageJson,
        rootPortlessConfigExists,
        webEnvironment,
        webPackageJson,
      ] = await Promise.all([
        readJsonFile(
          path.join(target, "apps/api/package.json"),
          scaffoldManifestSchema
        ),
        pathExists(path.join(target, "portless.json")),
        readFile(path.join(target, "apps/web/.env.example"), "utf-8"),
        readJsonFile(
          path.join(target, "apps/web/package.json"),
          scaffoldManifestSchema
        ),
      ]);
      expect({
        apiPackagePortless: apiPackageJson.portless,
        changesetsDependency: packageJson.devDependencies?.["@changesets/cli"],
        portlessDependency: packageJson.devDependencies?.portless,
        rootPortlessConfigExists,
        webEnvironmentHasLocalFallback: webEnvironment.includes(
          "NEXT_PUBLIC_WEB_URL=http://localhost:3000"
        ),
        webEnvironmentHasMaintainerHostname: webEnvironment.includes(
          "next-hydra.localhost"
        ),
        webPackagePortless: webPackageJson.portless,
      }).toStrictEqual({
        apiPackagePortless: undefined,
        changesetsDependency: undefined,
        portlessDependency: undefined,
        rootPortlessConfigExists: false,
        webEnvironmentHasLocalFallback: true,
        webEnvironmentHasMaintainerHostname: false,
        webPackagePortless: undefined,
      });

      await rm(target, { force: true, recursive: true });
    },
    E2E_TIMEOUT
  );

  it(
    "writes maintained Provider aliases into generated TypeScript configurations",
    async () => {
      const variants: {
        cms: "contentstack" | "drupal";
        sourcePath: string;
      }[] = [
        {
          cms: "contentstack",
          sourcePath: "../../packages/cms-contentstack",
        },
        {
          cms: "drupal",
          sourcePath: "../../packages/cms-drupal",
        },
      ];

      for (const variant of variants) {
        const target = path.join(testRoot, `${variant.cms}-aliases-project`);
        // oxlint-disable-next-line no-await-in-loop -- Each scaffold uses the shared local fixture repository and is cleaned before the next begins.
        await scaffoldProject(options(target, variant.cms), {
          install: fakeRootInstall,
        });
        // oxlint-disable-next-line no-await-in-loop -- The assertion observes the scaffold completed immediately above.
        const config = await readFile(
          path.join(target, "apps/web/tsconfig.json"),
          "utf-8"
        );
        expect(parse(config)).toMatchObject({
          compilerOptions: {
            paths: {
              "@repo/cms": [variant.sourcePath],
              "@repo/cms/*": [`${variant.sourcePath}/*`],
            },
          },
        });
        // oxlint-disable-next-line no-await-in-loop -- Cleanup keeps the two independently scaffolded variants isolated.
        await rm(target, { force: true, recursive: true });
      }
    },
    E2E_TIMEOUT
  );

  it(
    "reconstructs and builds the Contentstack storefront from selected registry items",
    async () => {
      const contentstackTarget = path.join(testRoot, "contentstack-project");
      await scaffoldProject(options(contentstackTarget, "contentstack"), {
        install: installWorkspace,
      });
      await runWorkspaceCommand(
        contentstackTarget,
        ["run", "build", "--force", "--output-logs=errors-only"],
        "storefront production build with typecheck and test gates",
        "production"
      );
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

      const contentstackWeb = scaffoldManifestSchema.parse(
        JSON.parse(
          await readFile(
            path.join(contentstackTarget, "apps/web/package.json"),
            "utf-8"
          )
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
    },
    E2E_TIMEOUT
  );

  it(
    "reconstructs the Drupal storefront from the Baseline and selected registry items",
    async () => {
      const drupalTarget = path.join(testRoot, "drupal-project");
      await scaffoldProject(options(drupalTarget, "drupal"), {
        install: installWorkspace,
      });
      await typecheckWorkspace(drupalTarget);
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

      const frontendConfig = await readFile(
        path.join(
          drupalTarget,
          "apps/drupal/recipes/next-hydra-starter/config/next.next_site.next_hydra.yml"
        ),
        "utf-8"
      );
      expect({
        frontendHasMaintainerHostname: frontendConfig.includes(
          "web.next-hydra.localhost"
        ),
        frontendHasProjectHostname: frontendConfig.includes("localhost:3000"),
      }).toStrictEqual({
        frontendHasMaintainerHostname: false,
        frontendHasProjectHostname: true,
      });

      const asset =
        "apps/drupal/recipes/next-hydra-starter/content/file/next-hydra-hero.webp";
      expect(hash(await readFile(path.join(drupalTarget, asset)))).toBe(
        hash(await readFile(path.join(repoRoot, asset)))
      );
      await rm(drupalTarget, { force: true, recursive: true });
    },
    E2E_TIMEOUT
  );

  it(
    "scaffolds the selected preset",
    async () => {
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
        Promise.all([
          pathExists(
            path.join(presetTarget, "packages/cms-contentstack/package.json")
          ),
          pathExists(
            path.join(presetTarget, "packages/cms-drupal/package.json")
          ),
        ])
      ).resolves.toStrictEqual([true, false]);
    },
    E2E_TIMEOUT
  );

  it(
    "installs and typechecks the generated Clerk application composition",
    async () => {
      const target = path.join(testRoot, "clerk-project");
      await scaffoldProject(options(target, "contentstack", "clerk"), {
        install: installWorkspace,
      });
      await typecheckWorkspace(target);
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
              "apps/web/app/[locale]/accept-invitation/[[...accept-invitation]]/page.tsx"
            )
          ),
          pathExists(
            path.join(
              target,
              "apps/web/app/[locale]/sign-in/[[...sign-in]]/page.tsx"
            )
          ),
        ])
      ).resolves.toStrictEqual([true, false, true, true, true, true, true]);

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
      const drupalPackage = scaffoldManifestSchema.parse(
        JSON.parse(
          await readFile(
            path.join(target, "packages/cms-drupal/package.json"),
            "utf-8"
          )
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
          install: vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("forced package-manager failure")),
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
