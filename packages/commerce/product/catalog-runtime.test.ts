// @vitest-environment node
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Catalog runtime binding", () => {
  it("retains the storefront's exact public runtime alias instead of bypassing it through a relative import", async () => {
    const source = await readFile(
      new URL("catalog-runtime.ts", import.meta.url),
      "utf-8"
    );
    expect(source).toContain(
      'import { NextCommerce } from "@repo/commerce/runtime"'
    );
    expect(source).not.toContain('from "../runtime"');
  });
});
