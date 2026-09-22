/**
 * Construct customer and developer workspaces from one selected file graph.
 * This does not clone, prune, or modify the reference application.
 * Every run requires a new output directory; existing workspaces are never replaced.
 */
/* oxlint-disable complexity, no-await-in-loop, no-console -- Composition reports ordered progress; package discovery depends on previously resolved manifests. */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { CompositionValidationError } from "./composition/errors.js";
import {
  installPreparedComposition,
  prepareComposition,
} from "./composition/install.js";
import { parsePackageJson, readPackageJson } from "./composition/packages.js";
import type { PackageJson } from "./composition/packages.js";
import { resolveRegistryTarget } from "./composition/paths.js";
import { planComposition } from "./composition/planner.js";
import { applyRegistryDependencies } from "./composition/registry-dependencies.js";
import type {
  SourceRegistryCatalog,
  WorkspaceSelection,
} from "./composition/types.js";
import { applyTypeScriptPathAliases } from "./composition/typescript-paths.js";
import {
  applyPackageRequirements,
  applyPnpmPatches,
} from "./composition/workspace.js";
import { normalizePackageName, pathExists, writeJsonFile } from "./fs-utils.js";
import { runCommand } from "./git.js";
import {
  assertMaintainerWorkspaceTarget,
  copyMaintainerEnvironmentFiles,
} from "./maintainer-workspace.js";
import {
  assertNewWorkspaceDirectory,
  assertDistinctFileTargets,
  claimWorkspaceDirectory,
  workspaceSourceFiles,
} from "./workspace-files.js";
import { workspaceTaskConfiguration } from "./workspace-tasks.js";
import type { WorkspaceOrigin } from "./workspace-update.js";

export type WorkspaceConstructionOptions = {
  catalog: SourceRegistryCatalog;
  selection: WorkspaceSelection;
  copyEnv?: boolean;
  install?: boolean;
  offline?: boolean;
  port?: number;
  name?: string;
  report?: (message: string) => void;
  allowEmpty?: boolean;
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

export async function constructWorkspace(
  targetDirectory: string,
  options: WorkspaceConstructionOptions
) {
  const report = options.report ?? console.log;
  const { catalog, selection } = options;
  const sourceRoot = catalog.cwd;
  const targetRoot = path.resolve(sourceRoot, targetDirectory);
  const relativeTarget = path.relative(sourceRoot, targetRoot);
  if (
    relativeTarget === "" ||
    (!relativeTarget.startsWith(`..${path.sep}`) &&
      relativeTarget !== ".." &&
      !path.isAbsolute(relativeTarget))
  ) {
    assertMaintainerWorkspaceTarget(sourceRoot, targetRoot);
  }
  if (!options.allowEmpty) {
    await assertNewWorkspaceDirectory(targetRoot);
  }
  const plan = planComposition(catalog, selection);
  const prepared = await prepareComposition(catalog, plan);
  const sourceFiles = await workspaceSourceFiles(sourceRoot);
  const sourcePaths = new Set(sourceFiles);
  const selected = prepared.artifacts.filter((item) =>
    plan.registryItems.includes(item.name)
  );
  const { templates } = plan;
  const sourceInputs = new Set([
    ...selected.flatMap((item) => (item.files ?? []).map((file) => file.path)),
    ...prepared.renderedFiles.map((file) => file.source),
    ...prepared.assets.map((file) => file.source),
    ...plan.pnpmPatches.map((patch) => patch.path),
  ]);
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
      if (file.content === undefined) {
        throw new Error(`Unresolved registry file: ${item.name}:${file.path}`);
      }
      if (!file.target) {
        throw new Error(`Missing registry target: ${item.name}:${file.path}`);
      }
      addFile(resolveRegistryTarget(file.target), {
        content: file.content,
        owner: item.name,
        source:
          sourcePaths.has(file.path) &&
          file.content ===
            (await readFile(path.join(sourceRoot, file.path), "utf-8"))
            ? file.path
            : undefined,
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
  // Registry packages may come from outside the source repository.
  for (const [target, file] of files) {
    if (/^(?:apps|packages|tests)\/[^/]+\/package.json$/u.test(target)) {
      const { name } = z
        .object({ name: z.string() })
        .parse(parsePackageJson(String(file.content), target));
      const dir = path.posix.dirname(target);
      const existing = packagesByName.get(name);
      if (existing && existing !== dir) {
        throw new Error(
          `Duplicate workspace package ${name}: ${existing}, ${dir}`
        );
      }
      packagesByName.set(name, dir);
    }
  }
  const registryManifest: PackageJson = {};
  applyRegistryDependencies(registryManifest, prepared.registryDependencies);
  const pending = [...files.entries()]
    .filter(([name]) =>
      /^(?:apps|packages|tests)\/[^/]+\/package.json$/u.test(name)
    )
    .flatMap(([name, file]) =>
      internalDependencies(parsePackageJson(String(file.content), name))
    );
  pending.push(...internalDependencies(registryManifest));
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
      !selection.providers.commerce &&
      /^@repo\/(?:commerce|registration|payments)/u.test(name)
    ) {
      throw new Error(
        `CMS-only composition still requires ${name}. Separate that provider's Commerce recipe before claiming CMS-only support.`
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
          `${name} is required but its registry item was not selected.`
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
        sourceInputs.add(source);
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
  if (!sourceManifest.devDependencies?.portless) {
    throw new Error(
      "Workspace composition requires Portless in the source checkout's devDependencies."
    );
  }
  const rootManifest = {
    devDependencies: Object.fromEntries(
      Object.entries({
        "@typescript/native":
          sourceManifest.devDependencies?.["@typescript/native"],
        portless: sourceManifest.devDependencies.portless,
        turbo: sourceManifest.devDependencies?.turbo,
        typescript: "catalog:",
      }).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    engines: sourceManifest.engines,
    name: normalizePackageName(options.name ?? path.basename(targetRoot)),
    packageManager: sourceManifest.packageManager,
    private: true,
    scripts: {
      build: "turbo run build",
      dev: "turbo run dev",
      test: "turbo run test",
      typecheck: "turbo run typecheck",
    },
  };
  if (files.has("tests/e2e/package.json")) {
    Object.assign(rootManifest.scripts, {
      "test:e2e": "turbo run e2e",
      "test:e2e:list": "turbo run e2e:list",
    });
  }
  // Customer package names may contain dots/underscores or exceed a DNS label.
  // Keep one project label so the runtime adapter can derive sibling app URLs.
  const hostNamespace = rootManifest.name
    .replaceAll(/[._]/gu, "-")
    .slice(0, 63)
    .replace(/-+$/u, "");
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
  workspace.packages = [
    "apps/*",
    "packages/*",
    ...(files.has("tests/e2e/package.json") ? ["tests/*"] : []),
  ];
  workspace.patchedDependencies = Object.fromEntries(
    plan.pnpmPatches.map((p) => [p.dependency, p.path])
  );
  addFile("pnpm-workspace.yaml", {
    content: stringifyYaml(workspace),
    owner: "workspace baseline",
  });
  addFile("turbo.json", {
    content: JSON.stringify(workspaceTaskConfiguration(files), null, 2),
    owner: "workspace baseline",
  });
  addFile(".gitignore", {
    content: `node_modules/\n.next/\n.turbo/\n.env\n.env.*\n!.env.example\n*.tsbuildinfo\n`,
    owner: "workspace baseline",
  });
  // Only adapt applications that explicitly use Portless. Package-owned build,
  // test, typecheck and custom development commands must survive composition.
  for (const [manifestPath, appManifestFile] of files) {
    if (!/^apps\/[^/]+\/package\.json$/u.test(manifestPath)) {
      continue;
    }
    const appManifest = parsePackageJson(
      String(appManifestFile.content),
      manifestPath
    );
    if (appManifest.portless === undefined) {
      continue;
    }
    const hosting = z
      .object({ script: z.string() })
      .passthrough()
      .parse(appManifest.portless);
    const scripts = z.record(z.string()).parse(appManifest.scripts ?? {});
    const usesPortless =
      scripts.dev === "portless" || scripts.dev?.startsWith("portless ");
    if (!usesPortless || hosting.script === "dev" || !scripts[hosting.script]) {
      throw new Error(
        `Invalid Portless development command in ${manifestPath}`
      );
    }
    const applicationPorts = new Map([
      ["apps/admin/package.json", (options.port ?? 3000) + 2],
      ["apps/api/package.json", (options.port ?? 3000) + 1],
      ["apps/web/package.json", options.port ?? 3000],
    ]);
    const port = applicationPorts.get(manifestPath);
    const application = path.posix.basename(path.posix.dirname(manifestPath));
    appManifest.portless = {
      ...hosting,
      appPort: options.port === undefined ? undefined : port,
      name: `${application}.${hostNamespace}`,
    };
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

  // Keep local host names scoped to the materialized project in every workflow.
  for (const [target, file] of files) {
    if (/\.(?:[cm]?[jt]sx?|json|ya?ml|md|example)$/u.test(target)) {
      file.content = String(file.content).replaceAll(
        /(?<application>web|api|admin)\.next-hydra\.localhost/gu,
        (_hostname, application: string) =>
          `${application}.${hostNamespace}.localhost`
      );
    }
  }
  report(
    `Composition plan: ${Object.values(selection.providers).join(" + ")}; ${files.size} files; ${templates.length} templates; ${includedPackages.size} packages; copied sources.`
  );
  // eslint-disable-next-line unicorn/no-array-sort -- The array is newly created.
  report(`Packages: ${[...includedPackages].sort().join(", ")}`);
  assertDistinctFileTargets([...files.keys()]);
  const missingManifests = [
    ...new Set(
      plan.packageRequirements.map((requirement) =>
        path.posix.join(requirement.cwd, "package.json")
      )
    ),
  ].filter((manifest) => !files.has(manifest));
  if (missingManifests.length) {
    throw new CompositionValidationError(
      "Package requirements target manifests absent from the selected workspace. Nothing was written.",
      missingManifests
    );
  }
  // Exclusive: never replace an existing workspace.
  const release = await claimWorkspaceDirectory(targetRoot, options.allowEmpty);
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
    stage = "applying registry transformations";
    // Keep ShadCN's file transformations, CSS, and environment handling for
    // third-party items. Pass the already selected/normalized content so it
    // cannot restore a maximal manifest or a maintainer-only import.
    await installPreparedComposition(targetRoot, {
      ...prepared,
      artifacts: prepared.artifacts.map((item) => ({
        ...item,
        files: item.files?.map((file) => ({
          ...file,
          content: file.target
            ? String(
                files.get(resolveRegistryTarget(file.target))?.content ??
                  file.content
              )
            : file.content,
        })),
      })),
      assets: [],
      registryDependencies: [],
      renderedFiles: [],
    });
    // Discover installer-owned output before installs and local credential
    // overlays. Refresh then protects these files just like registry:file output.
    for (const entry of await readdir(targetRoot, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || entry.name === ".workspace-create.lock") {
        continue;
      }
      const absolute = path.join(entry.parentPath, entry.name);
      const target = path
        .relative(targetRoot, absolute)
        .split(path.sep)
        .join("/");
      const content = await readFile(absolute);
      const previous = files.get(target);
      if (!previous) {
        addFile(target, { content, owner: "registry materialization" });
      } else if (!content.equals(Buffer.from(previous.content))) {
        previous.content = content;
        previous.source = undefined;
      }
    }
    await applyPackageRequirements(targetRoot, plan);
    // Registry transformations may introduce environment defaults. Capture their names too,
    // before local credentials are overlaid; values never enter the task configuration.
    await writeJsonFile(
      path.join(targetRoot, "turbo.json"),
      workspaceTaskConfiguration(files)
    );
    await applyTypeScriptPathAliases(targetRoot, plan);
    await applyPnpmPatches(targetRoot, plan);
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
    const authoringInstructions =
      "These are ordinary project files; no generation or composition step is required to maintain them.";
    report(
      `Created ${targetRoot}\nRun: pnpm --dir ${JSON.stringify(targetRoot)} dev\n${authoringInstructions}`
    );
    return {
      files: files.size,
      instructions: plan.instructions,
      origins: [...files].map(([target, file]) => ({
        origin: file.origin,
        owner: file.owner,
        target,
      })),
      packageName: rootManifest.name,
      packages: [...includedPackages],
      sourceInputs: {
        complete:
          !plan.registryItems.some((name) =>
            catalog.externalItemNames.has(name)
          ) && [...sourceInputs].every((source) => sourcePaths.has(source)),
        sources: [...sourceInputs],
      },
      targetRoot,
    };
  } catch (error) {
    throw new Error(
      `Composition stopped while ${stage}. Partial output is preserved at ${targetRoot}; existing folders are never replaced. Inspect and keep any local changes before choosing a new output.`,
      { cause: error }
    );
  } finally {
    await release();
  }
}
