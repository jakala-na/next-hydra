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
