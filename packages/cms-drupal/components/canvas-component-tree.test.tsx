import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../.canvas/components", () => ({ default: {} }));
vi.stubGlobal("React", { createElement, Fragment });

import { CanvasComponentTree } from "./canvas-component-tree";

describe("CanvasComponentTree", () => {
  it("uses the PageRegion name for draft geometry markers", () => {
    const html = renderToStaticMarkup(
      createElement(CanvasComponentTree, {
        regionId: "pre_header",
        tree: { canvasDraftMode: true, element: "renderless-container" },
      })
    );

    expect(html).toContain('data-canvas-region-id="pre_header"');
    expect(html).not.toContain('data-canvas-region-id="content"');
  });
});
