import { describe, expect, it } from "vitest";

import { productionUrl } from "./production-url";

describe("productionUrl", () => {
  it("uses HTTPS for a Vercel-style hostname", () => {
    expect(productionUrl("web.storefront.localhost").href).toBe(
      "https://web.storefront.localhost/"
    );
  });

  it("preserves an explicit HTTP development origin", () => {
    expect(productionUrl("http://localhost:3001").href).toBe(
      "http://localhost:3001/"
    );
  });
});
