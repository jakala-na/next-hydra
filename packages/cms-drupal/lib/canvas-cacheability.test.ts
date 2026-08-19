import { describe, expect, it } from "vitest";

import { getCanvasCachePolicy } from "./canvas-cacheability";

const OVERLONG_CACHE_TAG_LENGTH = 257;
const OVERFLOWING_CACHE_TAG_COUNT = 129;

describe("Canvas cacheability", () => {
  it("preserves Drupal tags and caches permanent responses until invalidation", () => {
    expect(
      getCanvasCachePolicy({
        contexts: ["languages:language_content", "url"],
        maxAge: -1,
        tags: ["canvas_page:2", "node:42", "node:42"],
      })
    ).toStrictEqual({
      life: {
        expire: Number.POSITIVE_INFINITY,
        revalidate: Number.POSITIVE_INFINITY,
        stale: 300,
      },
      tags: ["canvas_page:2", "node:42"],
    });
  });

  it("honors finite Drupal max age values", () => {
    expect(
      getCanvasCachePolicy({
        contexts: [],
        maxAge: 120,
        tags: ["canvas_page:2"],
      })
    ).toStrictEqual({
      life: { expire: 120, revalidate: 120, stale: 120 },
      tags: ["canvas_page:2"],
    });
  });

  it("preserves a permanent lifetime when metadata has too many tags", () => {
    expect(
      getCanvasCachePolicy({
        contexts: [],
        maxAge: -1,
        tags: Array.from(
          { length: OVERFLOWING_CACHE_TAG_COUNT },
          (_, index) => `node:${index}`
        ),
      })
    ).toStrictEqual({
      life: {
        expire: Number.POSITIVE_INFINITY,
        revalidate: Number.POSITIVE_INFINITY,
        stale: 300,
      },
      tags: [],
    });
  });

  it("preserves a finite max age when tags exceed Next.js limits", () => {
    expect(
      getCanvasCachePolicy({
        contexts: [],
        maxAge: 120,
        tags: ["x".repeat(OVERLONG_CACHE_TAG_LENGTH)],
      })
    ).toStrictEqual({
      life: { expire: 120, revalidate: 120, stale: 120 },
      tags: [],
    });
  });

  it.each([
    undefined,
    { contexts: [], maxAge: Number.NaN, tags: ["canvas_page:2"] },
    { contexts: [], maxAge: -1, tags: null } as never,
    { contexts: [1], maxAge: -1, tags: ["canvas_page:2"] } as never,
    { contexts: [], maxAge: 0, tags: ["canvas_page:2"] },
    { contexts: [], maxAge: -2, tags: ["canvas_page:2"] },
    { contexts: [], maxAge: -1, tags: [] },
    { contexts: [], maxAge: -1, tags: [""] },
  ])("does not cache unsafe metadata %#", (cacheability) => {
    expect(getCanvasCachePolicy(cacheability)).toBeUndefined();
  });
});
