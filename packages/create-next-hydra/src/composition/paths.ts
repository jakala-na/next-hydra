import path from "node:path";

import { CompositionValidationError } from "./errors.js";

const LEADING_CURRENT_DIRECTORY = /^\.\//;
const REGISTRY_SOURCE_DIRECTORY = "registry";

function normalizeRelativePath(value: string, label: string): string {
  if (value.includes("\\")) {
    throw new CompositionValidationError("Unsafe composition path.", [
      `${label} must use forward slashes: ${value}`,
    ]);
  }

  const normalized = path.posix.normalize(value);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new CompositionValidationError("Unsafe composition path.", [
      `${label} escapes or names the workspace root: ${value}`,
    ]);
  }

  return normalized.replace(LEADING_CURRENT_DIRECTORY, "");
}

export function resolveRegistryTarget(target: string): string {
  if (!target.startsWith("~/")) {
    throw new CompositionValidationError(
      "Registry files require workspace-root targets.",
      [`files[].target must start with ~/: ${target}`]
    );
  }
  const relativeTarget = target.startsWith("~/") ? target.slice(2) : target;
  return normalizeRelativePath(relativeTarget, "registry target");
}

export function resolveWorkspacePath(value: string, label: string): string {
  return normalizeRelativePath(value, label);
}

export function isManagedApplicationSource(
  sourcePath: string,
  target: string | undefined
): boolean {
  if (!target?.startsWith("~/")) {
    return false;
  }
  const normalized = path.posix
    .normalize(sourcePath)
    .replace(LEADING_CURRENT_DIRECTORY, "");
  const marker = `/${REGISTRY_SOURCE_DIRECTORY}/`;
  const sourceWithLeadingSlash = `/${normalized}`;
  const markerIndex = sourceWithLeadingSlash.lastIndexOf(marker);
  if (markerIndex < 0) {
    return false;
  }
  return (
    sourceWithLeadingSlash.slice(markerIndex + marker.length) ===
    target.slice(2)
  );
}
