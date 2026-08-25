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
        writeFile(join(directory, "stale.json"), "{}", "utf-8"),
        writeFile(join(directory, ".gitkeep"), "", "utf-8"),
      ]);

      await prepareSchemaDirectory(directory);

      await expect(readdir(directory)).resolves.toStrictEqual([".gitkeep"]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
