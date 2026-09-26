// Classification is shared; each operation still decides which categories it owns.
export const cacheDirectories: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".cache",
  ".swc",
  ".vercel",
]);

const environmentExamples = [".example", ".sample", ".template"];

export function environmentFileType(
  target: string
): "runtime" | "example" | undefined {
  const name = target.slice(target.lastIndexOf("/") + 1);
  if (name !== ".env" && !name.startsWith(".env.")) {
    return undefined;
  }
  return environmentExamples.some((suffix) => name.endsWith(suffix))
    ? "example"
    : "runtime";
}

export function isEnvironmentFile(target: string): boolean {
  return environmentFileType(target) === "runtime";
}

export function isCanonicalSource(file: string): boolean {
  const parts = file.split("/");
  return (
    parts[0] !== "workspaces" &&
    !parts.some(
      (part) =>
        part === ".git" ||
        cacheDirectories.has(part) ||
        part.startsWith(".workspace-composition")
    ) &&
    !isEnvironmentFile(file)
  );
}

export function eligiblePackageFile(file: string): boolean {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return (
    !file.includes("/registry/") &&
    name !== "registry.json" &&
    !name.endsWith(".template") &&
    !isEnvironmentFile(file)
  );
}
