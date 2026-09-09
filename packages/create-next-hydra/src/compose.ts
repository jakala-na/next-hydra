/**
 * Compose a CMS workspace from selected registry items and an explicit baseline.
 * This does not clone, prune, or modify the reference application.
 * Every run requires a new output directory; existing workspaces are never replaced.
 */
/* oxlint-disable complexity, no-await-in-loop, no-console -- Composition reports ordered progress; package discovery depends on previously resolved manifests. */
import {
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { loadSourceRegistryCatalog } from "./composition/catalog.js";
import { prepareComposition } from "./composition/install.js";
import { parsePackageJson, readPackageJson } from "./composition/packages.js";
import type { PackageJson } from "./composition/packages.js";
import { resolveRegistryTarget } from "./composition/paths.js";
import { planComposition } from "./composition/planner.js";
import { applyRegistryDependencies } from "./composition/registry-dependencies.js";
import type { WorkspaceSelection } from "./composition/types.js";
import { applyTypeScriptPathAliases } from "./composition/typescript-paths.js";
import {
  applyPackageRequirements,
  applyPnpmPatches,
} from "./composition/workspace.js";
import { normalizePackageName, pathExists, writeJsonFile } from "./fs-utils.js";
import { runCommand } from "./git.js";
import {
  assertMaintainerDependencyCompatibility,
  assertMaintainerWorkspaceTarget,
  copyMaintainerEnvironmentFiles,
  findMaintainerWorkspaceRoot,
} from "./maintainer-workspace.js";
import {
  assertNewWorkspaceDirectory,
  assertDistinctFileTargets,
  createWorkspaceDirectory,
  workspaceSourceFiles,
} from "./workspace-files.js";
import type { WorkspaceOrigin } from "./workspace-update.js";

export type ComposeOptions = {
  cms: string;
  auth?: string;
  commerce?: string;
  search?: boolean;
  linked?: boolean;
  copyEnv?: boolean;
  install?: boolean;
  offline?: boolean;
  addOns?: string[];
  port?: number;
};
/** Internal controls for preparing an update in an isolated staging directory. */
export type CompositionOutput = {
  development?: boolean;
  name?: string;
  report?: (message: string) => void;
  sourceRoot?: string;
};
type File = {
  content: string | Uint8Array;
  source?: string;
  owner: string;
  origin?: WorkspaceOrigin;
};
const sections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

function internalDependencies(manifest: PackageJson): string[] {
  return sections.flatMap((section) =>
    Object.entries(z.record(z.string()).parse(manifest[section] ?? {}))
      .filter(([, specifier]) => specifier.startsWith("workspace:"))
      .map(([name, specifier]) =>
        specifier.startsWith("workspace:@")
          ? specifier.slice(10, specifier.lastIndexOf("@"))
          : name
      )
  );
}

export async function composeWorkspace(
  targetDirectory: string,
  options: ComposeOptions,
  output: CompositionOutput = {}
) {
  const report = output.report ?? console.log;
  if (!["contentstack", "drupal"].includes(options.cms)) {
    throw new Error("Choose --cms contentstack or drupal.");
  }
  if (options.auth && !["workos", "clerk"].includes(options.auth)) {
    throw new Error("Choose --auth workos or clerk.");
  }
  const sourceRoot =
    output.sourceRoot ?? (await findMaintainerWorkspaceRoot(process.cwd()));
  const targetRoot = path.resolve(sourceRoot, targetDirectory);
  const relativeTarget = path.relative(sourceRoot, targetRoot);
  const insideSource =
    relativeTarget === "" ||
    (!relativeTarget.startsWith(`..${path.sep}`) &&
      relativeTarget !== ".." &&
      !path.isAbsolute(relativeTarget));
  if (options.linked || insideSource) {
    assertMaintainerWorkspaceTarget(sourceRoot, targetRoot);
  }
  await assertNewWorkspaceDirectory(targetRoot);

  const catalog = await loadSourceRegistryCatalog(sourceRoot, "registry.json");
  const selection: WorkspaceSelection = {
    addOns: [
      ...new Set([
        ...(options.addOns ?? []),
        ...(options.search ? ["app-web-navigation-search"] : []),
      ]),
    ],
    providers: {
      cms: options.cms,
    },
  };
  if (options.auth) {
    selection.providers.auth = options.auth;
  }
  if (options.commerce) {
    selection.providers.commerce = options.commerce;
  }
  const plan = planComposition(catalog, selection);
  const prepared = await prepareComposition(catalog, plan);
  const selected = prepared.artifacts.filter((item) =>
    plan.registryItems.includes(item.name)
  );
  const { templates } = plan;
  const files = new Map<string, File>();
  const addFile = (target: string, file: File) => {
    if (files.has(target)) {
      throw new Error(
        `Two owners for ${target}: ${files.get(target)?.owner}, ${file.owner}`
      );
    }
    files.set(target, {
      ...file,
      origin:
        file.origin ??
        (file.source ? { kind: "source", path: file.source } : undefined),
    });
  };
  for (const item of selected) {
    for (const file of item.files ?? []) {
      if (
        !file.target ||
        file.content === undefined ||
        file.type !== "registry:file"
      ) {
        throw new Error(
          `Workspace composition requires explicit registry:file targets: ${item.name}:${file.path}`
        );
      }
      addFile(resolveRegistryTarget(file.target), {
        content: file.content,
        owner: item.name,
        source: file.path,
      });
    }
  }
  for (const file of prepared.renderedFiles) {
    addFile(file.target, {
      content: file.content,
      origin: { kind: "template", path: file.source },
      owner: file.owner,
    });
  }
  for (const file of prepared.assets) {
    addFile(file.target, {
      content: file.content,
      origin: { kind: "asset", path: file.source },
      owner: file.owner,
    });
  }

  // Apply package selection BEFORE traversing dependencies. Never copy an unselected provider as a fallback.
  const requirements = new Map(
    plan.packageRequirements.map((r) => [
      `${r.cwd}\0${r.section}\0${r.name}`,
      r,
    ])
  );
  const selectedManifest = (target: string, manifest: PackageJson) => {
    const cwd = path.posix.dirname(target);
    for (const r of plan.catalogPackageRequirementTargets.filter(
      (candidate) => candidate.cwd === cwd
    )) {
      if (!requirements.has(`${cwd}\0${r.section}\0${r.name}`)) {
        delete manifest[r.section]?.[r.name];
      }
    }
    for (const r of plan.packageRequirements.filter(
      (candidate) => candidate.cwd === cwd
    )) {
      (manifest[r.section] ??= {})[r.name] = r.specifier;
    }
    return manifest;
  };
  for (const [target, file] of files) {
    if (target.endsWith("/package.json")) {
      file.content = `${JSON.stringify(selectedManifest(target, parsePackageJson(String(file.content), target)), null, 2)}\n`;
    }
  }

  const packagesByName = new Map<string, string>();
  for (const entry of await readdir(path.join(sourceRoot, "packages"), {
    withFileTypes: true,
  })) {
    const dir = `packages/${entry.name}`;
    if (
      !entry.isDirectory() ||
      !(await pathExists(path.join(sourceRoot, dir, "package.json")))
    ) {
      continue;
    }
    const manifest = await readPackageJson(
      path.join(sourceRoot, dir, "package.json")
    );
    const { name } = z.object({ name: z.string() }).parse(manifest);
    if (packagesByName.has(name)) {
      throw new Error(
        `Duplicate workspace package ${name}: ${packagesByName.get(name)}, ${dir}`
      );
    }
    packagesByName.set(name, dir);
  }
  const governed = new Set(
    [...catalog.items.values()].flatMap((item) =>
      (item.files ?? []).flatMap((file) =>
        file.target ? [resolveRegistryTarget(file.target)] : []
      )
    )
  );
  const sourceFiles = await workspaceSourceFiles(sourceRoot);
  const pending = [...files.entries()]
    .filter(([name]) => /^apps\/[^/]+\/package.json$/u.test(name))
    .flatMap(([name, file]) =>
      internalDependencies(parsePackageJson(String(file.content), name))
    );
  const includedPackages = new Set<string>();
  while (pending.length) {
    const name = pending.pop();
    if (!name) {
      break;
    }
    if (includedPackages.has(name)) {
      continue;
    }
    if (
      !options.commerce &&
      /^@repo\/(?:commerce|registration|payments)/u.test(name)
    ) {
      throw new Error(
        `CMS-only composition still requires ${name}. Separate that provider's commerce contribution before claiming CMS-only support.`
      );
    }
    const dir = packagesByName.get(name);
    if (!dir) {
      throw new Error(`Workspace dependency ${name} has no canonical package.`);
    }
    const target = `${dir}/package.json`;
    if (!files.has(target)) {
      if (governed.has(target)) {
        throw new Error(
          `${name} is required but its registry item was not selected. Do not hide this dependency by linking the maximal checkout.`
        );
      }
      for (const source of sourceFiles.filter(
        (file) =>
          file.startsWith(`${dir}/`) &&
          !file.includes("/registry/") &&
          !file.endsWith("/registry.json")
      )) {
        if (governed.has(source)) {
          continue;
        }
        addFile(source, {
          content: await readFile(path.join(sourceRoot, source)),
          owner: `baseline:${name}`,
          source,
        });
      }
    }
    const file = files.get(target);
    if (!file) {
      throw new Error(`Missing selected manifest: ${target}`);
    }
    const manifest = selectedManifest(
      target,
      parsePackageJson(String(file.content), target)
    );
    file.content = `${JSON.stringify(manifest, null, 2)}\n`;
    includedPackages.add(name);
    pending.push(...internalDependencies(manifest));
  }
  // Root infrastructure is an explicit baseline, not the maximal checkout's manifest or lifecycle scripts.
  const sourceManifest = await readPackageJson(
    path.join(sourceRoot, "package.json")
  );
  if (output.development && !sourceManifest.devDependencies?.portless) {
    throw new Error(
      "Named development workspaces require Portless in the source checkout's devDependencies."
    );
  }
  const rootManifest = {
    devDependencies: Object.fromEntries(
      Object.entries({
        "@typescript/native":
          sourceManifest.devDependencies?.["@typescript/native"],
        portless: output.development
          ? sourceManifest.devDependencies?.portless
          : undefined,
        turbo: sourceManifest.devDependencies?.turbo,
        typescript: "catalog:",
      }).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    engines: sourceManifest.engines,
    name: normalizePackageName(output.name ?? path.basename(targetRoot)),
    packageManager: sourceManifest.packageManager,
    private: true,
    scripts: {
      build: "turbo run build",
      dev: "turbo run dev",
      test: "turbo run test",
      typecheck: "turbo run typecheck",
    },
  };
  applyRegistryDependencies(rootManifest, prepared.registryDependencies);
  addFile("package.json", {
    content: `${JSON.stringify(rootManifest, null, 2)}\n`,
    owner: "workspace baseline",
  });
  const workspace = z
    .object({
      packages: z.array(z.string()),
      patchedDependencies: z.record(z.string()).optional(),
    })
    .passthrough()
    .parse(
      parseYaml(
        await readFile(path.join(sourceRoot, "pnpm-workspace.yaml"), "utf-8")
      )
    );
  workspace.packages = ["apps/*", "packages/*"];
  workspace.patchedDependencies = Object.fromEntries(
    plan.pnpmPatches.map((p) => [p.dependency, p.path])
  );
  addFile("pnpm-workspace.yaml", {
    content: stringifyYaml(workspace),
    owner: "workspace baseline",
  });
  addFile("turbo.json", {
    content: JSON.stringify(
      {
        tasks: {
          build: {
            cache: options.linked ? false : undefined,
            dependsOn: ["^build"],
            inputs: ["$TURBO_DEFAULT$", ".env", ".env.*"],
            outputs: [".next/**", "!.next/cache/**"],
          },
          dev: {
            cache: false,
            passThroughEnv: output.development ? ["PORTLESS_*"] : undefined,
            persistent: true,
          },
          test: {
            cache: options.linked ? false : undefined,
            dependsOn: ["^test"],
            inputs: ["$TURBO_DEFAULT$", ".env", ".env.*"],
          },
          typecheck: {
            cache: options.linked ? false : undefined,
            dependsOn: ["^typecheck"],
          },
        },
      },
      null,
      2
    ),
    owner: "workspace baseline",
  });
  addFile(".gitignore", {
    content: `node_modules/\n.next/\n.turbo/\n.env\n.env.*\n!.env.example\n*.tsbuildinfo\n${options.linked ? ".workspace-composition.json\n" : ""}`,
    owner: "workspace baseline",
  });
  // Named workspaces get stable local hosts. Copied verification outputs keep
  // plain Next scripts, without inheriting the maintainer checkout's identity.
  for (const [manifestPath, appManifestFile] of files) {
    if (!/^apps\/[^/]+\/package\.json$/u.test(manifestPath)) {
      continue;
    }
    const appManifest = parsePackageJson(
      String(appManifestFile.content),
      manifestPath
    );
    if (!appManifest.dependencies?.next) {
      continue;
    }
    const applicationPorts = new Map([
      ["apps/admin/package.json", (options.port ?? 3000) + 2],
      ["apps/api/package.json", (options.port ?? 3000) + 1],
      ["apps/web/package.json", options.port ?? 3000],
    ]);
    const port = applicationPorts.get(manifestPath);
    delete appManifest.portless;
    const scripts = {
      build: "NODE_USE_SYSTEM_CA=1 next build --turbopack",
      dev: `NODE_USE_SYSTEM_CA=1 next dev --turbopack${port === undefined ? "" : ` --port ${port}`}`,
      start: "next start",
      test: "NODE_ENV=test vitest run --passWithNoTests",
      typecheck: "next typegen && tsc --noEmit",
    };
    if (output.development) {
      const application = path.posix.basename(path.posix.dirname(manifestPath));
      appManifest.portless = {
        appPort: options.port === undefined ? undefined : port,
        name: `${application}.${rootManifest.name}`,
        script: "dev:app",
      };
      appManifest.scripts = {
        ...z.record(z.string()).parse(appManifest.scripts ?? {}),
        ...scripts,
        dev: "portless",
        "dev:app": "NODE_USE_SYSTEM_CA=1 next dev --turbopack",
      };
    } else {
      appManifest.scripts = scripts;
    }
    appManifestFile.content = `${JSON.stringify(appManifest, null, 2)}\n`;
  }

  // Seed tested versions, not a new resolution of every caret range. pnpm prunes
  // unused snapshots and reconciles the selected importers during installation.
  const lockfile = z
    .object({
      importers: z.record(z.unknown()),
      patchedDependencies: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .parse(
      parseYaml(
        await readFile(path.join(sourceRoot, "pnpm-lock.yaml"), "utf-8")
      )
    );
  lockfile.importers = Object.fromEntries(
    Object.entries(lockfile.importers).filter(([cwd]) =>
      files.has(cwd === "." ? "package.json" : `${cwd}/package.json`)
    )
  );
  lockfile.patchedDependencies = Object.fromEntries(
    Object.entries(lockfile.patchedDependencies ?? {}).filter(([dependency]) =>
      plan.pnpmPatches.some((patch) => patch.dependency === dependency)
    )
  );
  addFile("pnpm-lock.yaml", {
    content: stringifyYaml(lockfile),
    owner: "workspace baseline",
  });

  if (!options.linked) {
    // Customer output has ordinary module names and relative imports, not maintainer projection aliases.
    for (const [target, file] of files) {
      if (!/\.(?:ts|tsx)$/u.test(target)) {
        continue;
      }
      for (const alias of plan.typeScriptPathAliases.filter((item) =>
        item.alias.startsWith("@composition/")
      )) {
        file.content = String(file.content).replaceAll(
          new RegExp(
            `(["'])${alias.alias.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/([^"']+)\\1`,
            "gu"
          ),
          (_match, quote: string, module: string) => {
            const relative = path.posix.relative(
              path.posix.dirname(target),
              path.posix.join(alias.sourcePath, module)
            );
            return `${quote}${relative.startsWith(".") ? relative : `./${relative}`}${quote}`;
          }
        );
      }
    }
  }
  report(
    `Composition plan: ${options.cms}${options.commerce ? ` + ${options.commerce}` : ""}${options.auth ? ` + ${options.auth}` : ""}; ${files.size} files; ${templates.length} templates; ${includedPackages.size} packages; ${options.linked ? "linked sources" : "copied sources"}.`
  );
  // eslint-disable-next-line unicorn/no-array-sort -- The array is newly created.
  report(`Packages: ${[...includedPackages].sort().join(", ")}`);
  assertDistinctFileTargets([...files.keys()]);
  // Exclusive: never replace an existing workspace.
  await createWorkspaceDirectory(targetRoot);
  let stage = "writing the selected files";
  try {
    for (const [target, file] of files) {
      const destination = path.join(targetRoot, target);
      await mkdir(path.dirname(destination), { recursive: true });
      const sourceInfo = file.source
        ? await stat(path.join(sourceRoot, file.source))
        : undefined;
      await writeFile(destination, file.content, {
        // oxlint-disable-next-line no-bitwise -- Preserve POSIX permissions without copying special mode bits.
        mode: (sourceInfo?.mode ?? 0o644) & 0o777,
      });
    }
    await applyPackageRequirements(targetRoot, plan);
    await applyTypeScriptPathAliases(targetRoot, {
      ...plan,
      typeScriptPathAliases: plan.typeScriptPathAliases.filter(
        (alias) =>
          options.linked === true || !alias.alias.startsWith("@composition/")
      ),
    });
    if (!options.linked) {
      const configPath = path.join(
        targetRoot,
        `packages/cms-${options.cms}/tsconfig.json`
      );
      const config = z
        .object({
          compilerOptions: z
            .object({ paths: z.record(z.array(z.string())) })
            .passthrough(),
        })
        .passthrough()
        .parse(JSON.parse(await readFile(configPath, "utf-8")));
      config.compilerOptions.paths = Object.fromEntries(
        Object.entries(config.compilerOptions.paths).filter(
          ([alias]) => !alias.startsWith("@composition/")
        )
      );
      await writeJsonFile(configPath, config);
    }
    await applyPnpmPatches(targetRoot, plan);
    stage = "checking source-link compatibility";
    if (options.linked) {
      await assertMaintainerDependencyCompatibility(sourceRoot, targetRoot);
    }
    stage = "copying local environment files";
    const environmentFiles = options.copyEnv
      ? await copyMaintainerEnvironmentFiles(sourceRoot, targetRoot)
      : [];
    report(
      `Copied ${environmentFiles.length} ignored environment files (contents not logged).`
    );
    if (options.install !== false) {
      stage = "installing dependencies";
      report("Installing this workspace's own dependency graph...");
      await runCommand(
        "pnpm",
        [
          "install",
          ...(options.offline ? ["--offline"] : []),
          "--no-frozen-lockfile",
        ],
        { cwd: targetRoot, verbose: true }
      );
    }
    const links: { source: string; target: string }[] = [];
    if (options.linked) {
      stage = "linking canonical source";
      // File links preserve each projection's manifest and node_modules. Composition-sensitive entries stay physical.
      const copied = plan.maintainerCopyTargets;
      for (const [target, file] of files) {
        if (
          !file.source ||
          target.endsWith("/package.json") ||
          target.endsWith("/tsconfig.json") ||
          copied.some(
            (root) => target === root || target.startsWith(`${root}/`)
          )
        ) {
          continue;
        }
        const destination = path.join(targetRoot, target);
        // Replace only a file we just wrote, never a user-created path.
        await unlink(destination);
        await symlink(
          path.relative(
            path.dirname(destination),
            path.join(sourceRoot, file.source)
          ),
          destination
        );
        links.push({ source: file.source, target });
      }
      stage = "recording maintainer ownership";
      await writeJsonFile(
        path.join(targetRoot, ".workspace-composition.json"),
        {
          environmentFiles,
          files: [...files].map(([target, file]) => ({
            mode: links.some((link) => link.target === target)
              ? "linked"
              : "copied",
            origin: file.origin,
            owner: file.owner,
            source: file.source,
            target,
          })),
          linked: options.linked ?? false,
          links,
          selection,
          sourceRoot,
          templates,
          version: 1,
        }
      );
    }
    const authoringInstructions = options.linked
      ? "Composed files are physical; edit their template and scaffold a new folder to recompose. Preserve any locally authored files before switching outputs."
      : "These are ordinary customer-owned files; no generation or composition step is required to maintain them.";
    report(
      `Created ${targetRoot}\nRun: pnpm --dir ${JSON.stringify(targetRoot)} dev\n${authoringInstructions}`
    );
    return {
      files: files.size,
      origins: [...files].map(([target, file]) => ({
        target,
        origin: file.origin,
      })),
      links: links.length,
      packages: [...includedPackages],
      targetRoot,
    };
  } catch (error) {
    throw new Error(
      `Composition stopped while ${stage}. Partial output is preserved at ${targetRoot}; existing folders are never replaced. Inspect and keep any local changes before choosing a new output.`,
      { cause: error }
    );
  }
}
