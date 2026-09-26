import { Effect, FileSystem, Path } from "effect";

import {
  DestinationNotEmpty,
  InvalidComposition,
  SourceChanged,
} from "./errors.ts";
import { cacheDirectories, isEnvironmentFile } from "./file-policy.ts";
import type { PreparedWorkspace } from "./model.ts";

type WorkspaceSettingKind = "definition" | "readme" | "ignore" | "deployment";

// A wildcard represents exactly one directory, never a recursive file pattern.
// Ownership and initial Git visibility are derived from the same declaration.
const settings: readonly {
  readonly directory: readonly string[];
  readonly files: Readonly<Record<string, WorkspaceSettingKind>>;
}[] = [
  {
    directory: [],
    files: {
      ".gitignore": "ignore",
      "README.md": "readme",
      "next-hydra.json": "definition",
    },
  },
  {
    directory: ["apps", "*"],
    files: { ".gitignore": "ignore", "vercel.json": "deployment" },
  },
];

export function workspaceSetting(
  target: string
): WorkspaceSettingKind | undefined {
  const parts = target.split("/");
  const name = parts.pop();
  if (!name) {
    return undefined;
  }
  const group = settings.find(
    ({ directory }) =>
      directory.length === parts.length &&
      directory.every((segment, index) =>
        segment === "*" ? Boolean(parts[index]) : segment === parts[index]
      )
  );
  return group && Object.hasOwn(group.files, name)
    ? group.files[name]
    : undefined;
}

function namedIgnoreRules(): string {
  const rules = new Set([
    "# Commit workspace settings only; Compose owns the materialized application.",
    "/*",
  ]);
  for (const { directory, files } of settings) {
    let prefix = "/";
    for (const segment of directory) {
      prefix += `${segment}/`;
      rules.add(`!${prefix}`);
      rules.add(`${prefix}*`);
    }
    for (const name of Object.keys(files)) {
      rules.add(`!${prefix}${name}`);
    }
  }
  return `${[...rules].join("\n")}\n`;
}

export const namedInitializationFiles = Effect.fn(
  "Workspaces.namedInitializationFiles"
)(function* (
  files: PreparedWorkspace["files"],
  preserved: ReadonlySet<string>
) {
  const targets = new Set(files.map((file) => file.target));
  for (const target of preserved) {
    if (
      workspaceSetting(target) === "deployment" &&
      !targets.has(`${target.slice(0, target.lastIndexOf("/"))}/package.json`)
    ) {
      return yield* new InvalidComposition({
        message: `Deployment settings target an unselected application: ${target}`,
      });
    }
  }
  const output: PreparedWorkspace["files"][number][] = [];
  for (const file of files) {
    const parts = file.target.split("/");
    if (parts[0]?.startsWith(".workspace-composition")) {
      return yield* new InvalidComposition({
        message: `Composition cannot own workspace state: ${file.target}`,
      });
    }
    if (parts.some((part) => cacheDirectories.has(part))) {
      return yield* new InvalidComposition({
        message: `Composition cannot own cache paths: ${file.target}`,
      });
    }
    for (let end = 1; end < parts.length; end += 1) {
      const ancestor = parts.slice(0, end).join("/");
      if (workspaceSetting(ancestor) || isEnvironmentFile(ancestor)) {
        return yield* new InvalidComposition({
          message: `Composition cannot write below workspace settings: ${file.target}`,
        });
      }
    }
    const setting = workspaceSetting(file.target);
    if (setting === "ignore" || setting === "deployment") {
      continue;
    }
    if (setting !== undefined) {
      return yield* new InvalidComposition({
        message: `Composition cannot own workspace settings: ${file.target}`,
      });
    }
    output.push(file);
  }
  if (!preserved.has(".gitignore")) {
    output.push({
      content: new TextEncoder().encode(namedIgnoreRules()),
      mode: 0o644,
      origin: { kind: "policy", policy: "application-ignore", sources: [] },
      target: ".gitignore",
    });
  }
  return output;
});

export const listUnregisteredFiles = Effect.fn(
  "Workspaces.listUnregisteredFiles"
)(function* (destination: string, owned: ReadonlySet<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const unexpected: string[] = [];
  if (!(yield* fs.exists(destination))) {
    return unexpected;
  }
  if ((yield* fs.stat(destination)).type !== "Directory") {
    return yield* new DestinationNotEmpty({ directory: destination });
  }
  const pending = [""];
  while (pending.length) {
    const directory = pending.pop();
    if (directory === undefined) {
      break;
    }
    for (const name of yield* fs.readDirectory(
      path.join(destination, directory)
    )) {
      const target = directory ? `${directory}/${name}` : name;
      const stat = yield* fs.stat(path.join(destination, target));
      if (target === ".git") {
        unexpected.push(target);
        continue;
      }
      if (
        ([
          ".workspace-composition.lock",
          ".workspace-composition.recovery",
        ].includes(target) &&
          stat.type === "Directory") ||
        (target === ".workspace-composition.json" && stat.type === "File")
      ) {
        continue;
      }
      if (owned.has(target)) {
        if (stat.type !== "File") {
          unexpected.push(target);
        }
        continue;
      }
      if (cacheDirectories.has(name)) {
        if (stat.type !== "Directory") {
          unexpected.push(target);
        }
        continue;
      }
      if (workspaceSetting(target) || isEnvironmentFile(target)) {
        if (stat.type !== "File") {
          unexpected.push(target);
        }
      } else if (stat.type === "Directory") {
        pending.push(target);
      } else {
        unexpected.push(target);
      }
    }
  }
  return unexpected;
});

const settingDirectories = Effect.fn("Workspaces.settingDirectories")(
  function* (destination: string, pattern: readonly string[]) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let directories = [""];
    for (const segment of pattern) {
      const next: string[] = [];
      for (const directory of directories) {
        const names =
          segment === "*"
            ? yield* fs.readDirectory(path.join(destination, directory))
            : [segment];
        for (const name of names) {
          const target = directory ? `${directory}/${name}` : name;
          const absolute = path.join(destination, target);
          if (
            (yield* fs.exists(absolute)) &&
            (yield* fs.stat(absolute)).type === "Directory"
          ) {
            next.push(target);
          }
        }
      }
      directories = next;
    }
    return directories;
  }
);

export const inspectInitialization = Effect.fn(
  "Workspaces.inspectInitialization"
)(function* (destination: string, definition?: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const preserved = new Set<string>();
  if (!(yield* fs.exists(destination))) {
    if (definition !== undefined) {
      return yield* new SourceChanged({ paths: ["next-hydra.json"] });
    }
    return preserved;
  }
  if ((yield* fs.stat(destination)).type !== "Directory") {
    return yield* new DestinationNotEmpty({ directory: destination });
  }
  if (definition === undefined) {
    if ((yield* fs.readDirectory(destination)).length) {
      return yield* new DestinationNotEmpty({ directory: destination });
    }
    return preserved;
  }
  if (yield* fs.exists(path.join(destination, ".git"))) {
    return yield* new DestinationNotEmpty({ directory: destination });
  }
  // Probe declared settings directly; unrelated output need not be readable.
  // WorkspaceFiles separately verifies owned files and publication targets.
  for (const group of settings) {
    for (const directory of yield* settingDirectories(
      destination,
      group.directory
    )) {
      for (const name of Object.keys(group.files)) {
        const target = directory ? `${directory}/${name}` : name;
        const absolute = path.join(destination, target);
        if (!(yield* fs.exists(absolute))) {
          continue;
        }
        if ((yield* fs.stat(absolute)).type !== "File") {
          return yield* new DestinationNotEmpty({ directory: destination });
        }
        preserved.add(target);
      }
    }
  }
  if (
    (yield* fs.readFileString(path.join(destination, "next-hydra.json"))) !==
    definition
  ) {
    return yield* new SourceChanged({ paths: ["next-hydra.json"] });
  }
  return preserved;
});
