import { readFileSync } from "node:fs";
import path from "node:path";

import { canonicalizeCanvasHeadlessPropValue } from "@drupal-canvas/workbench/dist/client/src/lib/preview-content-entity-reference";
import { describe, expect, it } from "vitest";

const workspaceConfig = readFileSync(
  path.resolve(import.meta.dirname, "../../../pnpm-workspace.yaml"),
  "utf8"
);
const hasWorkbenchPatch =
  /["']?@drupal-canvas\/workbench@0\.10\.0["']?\s*:\s*patches\/@drupal-canvas__workbench@0\.10\.0\.patch/u.test(
    workspaceConfig
  );

describe.skipIf(!hasWorkbenchPatch)(
  "Canvas Workbench headless prop canonicalization",
  () => {
    it("recursively matches Canvas Headless key casing", () => {
      expect(canonicalizeCanvasHeadlessPropValue).toBeTypeOf("function");
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
  }
);
