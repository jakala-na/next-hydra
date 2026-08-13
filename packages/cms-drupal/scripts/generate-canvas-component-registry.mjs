import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildComponentRegistryModule } from "@drupal-canvas/headless/component-registry";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const modulePath = resolve(projectRoot, ".canvas/components.ts");
const source = await buildComponentRegistryModule({ modulePath, projectRoot });

let currentSource;

try {
  currentSource = await readFile(modulePath, "utf8");
} catch (error) {
  if (!isFileNotFoundError(error)) {
    throw error;
  }
}

if (currentSource !== source) {
  await mkdir(dirname(modulePath), { recursive: true });
  await writeFile(modulePath, source);
}

function isFileNotFoundError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
