import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const INVALID_PACKAGE_CHARS_REGEX = /[^a-z0-9._-]+/g;
const DUPLICATE_DASHES_REGEX = /-+/g;
const LEADING_PUNCTUATION_REGEX = /^[._-]+/;
const TRAILING_PUNCTUATION_REGEX = /[._-]+$/;
const PACKAGE_START_CHAR_REGEX = /^[a-z0-9]/;
const MAX_UNSCOPED_PACKAGE_NAME_LENGTH = 214;

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectoryEmpty(targetPath: string): Promise<boolean> {
  const targetStat = await stat(targetPath);
  if (!targetStat.isDirectory()) {
    throw new Error(`Target path exists and is not a directory: ${targetPath}`);
  }

  const entries = await readdir(targetPath);
  return entries.length === 0;
}

export async function ensureParentDirectory(targetPath: string): Promise<void> {
  const parentDir = path.dirname(targetPath);
  await mkdir(parentDir, { recursive: true });
  await access(parentDir);
}

export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(
  filePath: string,
  value: unknown
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function toDisplayPath(
  absolutePath: string,
  cwd = process.cwd()
): string {
  const relative = path.relative(cwd, absolutePath);

  if (!relative || relative === "") {
    return ".";
  }

  if (relative.startsWith("..")) {
    return absolutePath;
  }

  return relative;
}

export function normalizePackageName(input: string): string {
  let value = input.trim().toLowerCase();

  value = value.replace(INVALID_PACKAGE_CHARS_REGEX, "-");
  value = value.replace(DUPLICATE_DASHES_REGEX, "-");
  value = value.replace(LEADING_PUNCTUATION_REGEX, "");
  value = value.replace(TRAILING_PUNCTUATION_REGEX, "");

  if (!value) {
    return "next-hydra-app";
  }

  if (!PACKAGE_START_CHAR_REGEX.test(value)) {
    value = `app-${value}`;
  }

  return value.slice(0, MAX_UNSCOPED_PACKAGE_NAME_LENGTH);
}
