import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readJsonFile } from "../src/fs-utils.js";
import { sanitizeStarter } from "../src/sanitize.js";

const recipeConfig = "apps/drupal/recipes/next-hydra-starter/config";

describe("customer workspace hostnames", () => {
  it("keeps both Drupal preview integrations on the renamed application", async () => {
    const targetPath = await mkdtemp(
      path.join(tmpdir(), "scaffold-hostnames-")
    );
    try {
      await mkdir(path.join(targetPath, recipeConfig), { recursive: true });
      await mkdir(path.join(targetPath, "apps/web"), { recursive: true });
      await writeFile(path.join(targetPath, "package.json"), "{}");
      await writeFile(
        path.join(targetPath, "apps/web/package.json"),
        JSON.stringify({ portless: { name: "web.next-hydra" } })
      );
      const configFiles = [
        "canvas_headless.settings.yml",
        "next.next_site.next_hydra.yml",
      ];
      await Promise.all(
        configFiles.map(async (file) => {
          await copyFile(
            path.resolve(import.meta.dirname, "../../..", recipeConfig, file),
            path.join(targetPath, recipeConfig, file)
          );
        })
      );

      await sanitizeStarter({ targetName: "field-service", targetPath });

      const web = await readJsonFile<{ portless: { name: string } }>(
        path.join(targetPath, "apps/web/package.json")
      );
      const configs = await Promise.all(
        configFiles.map(
          async (file) =>
            await readFile(path.join(targetPath, recipeConfig, file), "utf-8")
        )
      );
      expect(web.portless.name).toBe("web.field-service");
      for (const config of configs) {
        expect(config).toContain(`https://${web.portless.name}.localhost`);
        expect(config).not.toContain("web.next-hydra.localhost");
      }
    } finally {
      await rm(targetPath, { force: true, recursive: true });
    }
  });
});
