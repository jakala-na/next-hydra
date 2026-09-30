import { describe, expect, it } from "vitest";

import { formatContentIndexingHandoff } from "./content-indexing-handoff";

describe(formatContentIndexingHandoff, () => {
  it("formats provider-owned instructions as the final numbered handoff", () => {
    expect(
      formatContentIndexingHandoff({
        instructions: [
          'Configure the destination as "acceptance--content".',
          "Start the initial sync.",
        ],
        title: "Complete Content indexing in the selected CMS",
      })
    ).toBe(`
Complete Content indexing in the selected CMS:
  1. Configure the destination as "acceptance--content".
  2. Start the initial sync.`);
  });
});
