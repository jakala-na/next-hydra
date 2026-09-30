// @vitest-environment node

import { history } from "instantsearch.js/es/lib/routers";
import { describe, expect, it } from "vitest";

import { getInstantSearchLocation } from "./instant-search-history";

describe(getInstantSearchLocation, () => {
  it("lets the InstantSearch history router read the request URL during SSR", () => {
    const router = history<{ readonly q?: string }>({
      getLocation: () =>
        getInstantSearchLocation("http://localhost/search?q=excavator"),
      parseURL: ({ location }) => ({
        q: new URLSearchParams(location.search).get("q") ?? undefined,
      }),
    });

    expect(router.read()).toStrictEqual({ q: "excavator" });
  });
});
