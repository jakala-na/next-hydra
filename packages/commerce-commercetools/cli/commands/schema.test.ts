import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareSchemaDirectory } from "./schema";

describe("schema export", () => {
  it("removes stale JSON snapshots without deleting other files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "next-hydra-schema-"));

    try {
      await Promise.all([
        writeFile(join(directory, "stale.json"), "{}", "utf8"),
        writeFile(join(directory, ".gitkeep"), "", "utf8"),
      ]);

      await prepareSchemaDirectory(directory);

      expect(await readdir(directory)).toEqual([".gitkeep"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
