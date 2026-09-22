/** These cache directories may be restored before a named workspace is initialized. */
export const workspaceCacheDirectories: ReadonlySet<string> = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  ".swc",
  ".vercel",
]);

/** Neither composition ownership nor task source hashes should include these directories. */
export const workspaceNonSourceDirectories: ReadonlySet<string> = new Set([
  ...workspaceCacheDirectories,
  ".git",
  "dist",
  "coverage",
  ".workflow-data",
]);

/** Maintainer task metadata is preserved alongside deployment settings, never scaffolded to customers. */
export const workspaceTaskFiles: ReadonlySet<string> = new Set([
  "tasks/package.json",
  "tasks/turbo.json",
]);

/** Named-workspace settings are preserved independently of registry-owned output. */
export function workspaceSettingKind(
  target: string
): "ignore" | "deployment" | "tasks" | undefined {
  if (target === ".gitignore" || /^apps\/[^/]+\/\.gitignore$/u.test(target)) {
    return "ignore";
  }
  if (/^apps\/[^/]+\/vercel\.json$/u.test(target)) {
    return "deployment";
  }
  if (workspaceTaskFiles.has(target)) {
    return "tasks";
  }
  return undefined;
}
