import path from "node:path";

import { CompositionValidationError } from "./errors.js";
import type { RouteClaim } from "./types.js";

const LEADING_CURRENT_DIRECTORY = /^\.\//;

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

export function normalizeWorkspaceRoot(value: string): string {
  const trimmed = value.trim();
  return trimmed === "."
    ? "."
    : normalizeRelativePath(trimmed, "Install Unit root");
}

export function resolveRegistryTarget(cwd: string, target: string): string {
  const relativeTarget = target.startsWith("~/") ? target.slice(2) : target;
  const combined = cwd === "." ? relativeTarget : `${cwd}/${relativeTarget}`;
  return normalizeRelativePath(combined, "registry target");
}

export function normalizeRoutePath(routePath: string): string {
  const normalizedPath = path.posix.normalize(routePath);
  const normalized =
    normalizedPath.length > 1 && normalizedPath.endsWith("/")
      ? normalizedPath.slice(0, -1)
      : normalizedPath;
  if (
    !normalized.startsWith("/") ||
    normalized === "/" ||
    normalized.includes("\\") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new CompositionValidationError("Unsafe route path.", [
      `route path must name a non-root application path: ${routePath}`,
    ]);
  }

  return normalized;
}

export function routeTarget(claim: RouteClaim): string {
  const app = normalizeRelativePath(claim.app, "route app");
  const route = normalizeRoutePath(claim.path).slice(1);
  return `${app}/app/${route}/route.ts`;
}
