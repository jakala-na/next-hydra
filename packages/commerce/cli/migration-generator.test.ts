import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMigration } from "./migration-generator";

describe("migration generator", () => {
  it("creates a sortable kebab-case migration file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "next-hydra-migration-"));

    try {
      const fileName = await createMigration(
        directory,
        "Add checkout field",
        "Add checkout state",
        new Date("2026-07-28T13:00:00")
      );

      expect(fileName).toBe("2026-07-28-130000-add-checkout-field.ts");
      expect(await readFile(join(directory, fileName), "utf8")).toContain(
        'description: "Add checkout state"'
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
