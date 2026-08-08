import { describe, expect, it, vi } from "vitest";

vi.mock("./architecture-config", () => ({
  architectureOverlaysEnabled: true,
}));

import { ArchitectureBoundary } from "./architecture-boundary";

describe("ArchitectureBoundary", () => {
  it("renders exact cache metadata for the educational overlay", () => {
    const element = ArchitectureBoundary({
      cacheProfile: "hours",
      cacheTags: ["node:1", "node:42"],
      children: <main>Landing page</main>,
      component: "server",
      description: "Cached Drupal route",
      layer: "route",
      layerLabel: "CMS route and page registry",
      name: "DrupalPageRoute",
      rendering: "cached",
      source: "cms",
      sourceLabel: "Drupal CMS",
    });

    expect(element).toMatchObject({
      props: {
        "data-architecture-component": "server",
        "data-architecture-layer": "route",
        "data-architecture-rendering": "cached",
        "data-architecture-source": "cms",
        title: expect.stringContaining(
          "cached · hours · tags: node:1, node:42"
        ),
      },
      type: "div",
    });
  });
});
