import { canonicalizeCanvasHeadlessPropValue } from "@drupal-canvas/workbench/dist/client/src/lib/preview-content-entity-reference";
import { describe, expect, it } from "vitest";

describe("Canvas Workbench headless prop canonicalization", () => {
  it("recursively matches Canvas Headless key casing", () => {
    expect(
      canonicalizeCanvasHeadlessPropValue({
        field_image: {
          field_media_image: {
            src_with_alternate_widths: ["small", "large"],
          },
        },
        field_summary: "Summary",
      })
    ).toEqual({
      fieldImage: {
        fieldMediaImage: {
          srcWithAlternateWidths: ["small", "large"],
        },
      },
      fieldSummary: "Summary",
    });
  });
});
