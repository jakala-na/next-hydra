import path from "node:path";

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
  ".features-gen",
  "playwright-report",
  "test-results",
  ".workflow-data",
]);

/** Workspace-owned settings, shared by initialization, refresh and inspection. */
const workspaceSettings = [
  { kind: "ignore", patterns: [".gitignore", "apps/*/.gitignore"] },
  { kind: "deployment", patterns: ["apps/*/vercel.json"] },
  { kind: "tasks", patterns: ["tasks/package.json", "tasks/turbo.json"] },
] as const;

/** Named-workspace settings are preserved independently of registry-owned output. */
export function workspaceSettingKind(
  target: string
): "ignore" | "deployment" | "tasks" | undefined {
  return workspaceSettings.find(({ patterns }) =>
    patterns.some((pattern) => path.posix.matchesGlob(target, pattern))
  )?.kind;
}
