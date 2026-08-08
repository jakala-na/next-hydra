import { fileURLToPath } from "node:url";

export const canvasProjectRoot = fileURLToPath(new URL(".", import.meta.url));
