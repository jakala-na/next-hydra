import { describe, expect, it } from "vitest";

import { generateCanvasComponentTypes } from "./generate-canvas-component-types.mjs";

const COMPACT_LIMIT = 3;
const DEFAULT_LIMIT = 6;
const EXPANDED_LIMIT = 9;
const LIMIT_OPTIONS = [COMPACT_LIMIT, DEFAULT_LIMIT, EXPANDED_LIMIT];

describe("generateCanvasComponentTypes", () => {
  it("generates required props, enum literals, and named slots", () => {
    const source = generateCanvasComponentTypes(
      [
        {
          machineName: "featured-items",
          props: {
            limit: { enum: LIMIT_OPTIONS, type: "integer" },
            title: { type: "string" },
          },
          required: ["title"],
          slots: { items: { title: "Items" } },
        },
      ],
      new Map()
    );

    expect(source).toContain("title: string;");
    expect(source).toContain("limit?: 3 | 6 | 9;");
    expect(source).toContain("items?: ReactNode;");
  });

  it("maps only the default slot to children", () => {
    const source = generateCanvasComponentTypes(
      [
        {
          machineName: "section",
          props: {},
          required: [],
          slots: {
            default: { title: "Content" },
            sidebar: { title: "Sidebar" },
          },
        },
      ],
      new Map()
    );

    expect(source).toContain("children?: ReactNode;");
    expect(source).toContain("sidebar?: ReactNode;");
  });

  it("infers camel-cased content entity reference fields from a mock", () => {
    const source = generateCanvasComponentTypes(
      [
        {
          machineName: "article-card",
          props: {
            article: {
              $ref: "json-schema-definitions://canvas.module/content-entity-reference",
              type: "object",
            },
          },
          required: [],
          slots: {},
        },
      ],
      new Map([
        [
          "article-card:article",
          {
            _Type: "article",
            fieldImage: {
              fieldMediaImage: { src: "/article.jpg" },
            },
            fieldSummary: "Summary",
          },
        ],
      ])
    );

    expect(source).toContain("fieldSummary?: string | null;");
    expect(source).toContain("fieldImage?: {");
    expect(source).toContain("fieldMediaImage?: {");
    expect(source).not.toContain("field_summary");
  });

  it("requires a representative value for content entity references", () => {
    expect(() =>
      generateCanvasComponentTypes(
        [
          {
            machineName: "article-card",
            props: {
              article: {
                $ref: "json-schema-definitions://canvas.module/content-entity-reference",
                type: "object",
              },
            },
            required: [],
            slots: {},
          },
        ],
        new Map()
      )
    ).toThrow("representative non-null value");
  });
});
