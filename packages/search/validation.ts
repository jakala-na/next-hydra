import { z } from "zod";

import type { SearchBatch } from "./contract";
import {
  PRODUCT_FACETS,
  SEARCH_HIT_ATTRIBUTES,
  SEARCH_INDEX_ALIASES,
} from "./contract";

const MAX_BATCH_SIZE = 8;
const MAX_HITS_PER_PAGE = 48;
const MAX_VALUES_PER_FACET = 100;

const productFacets = new Set<string>(PRODUCT_FACETS);

const facetFilterValueSchema = z.string().refine(
  (filter) => {
    const separator = filter.indexOf(":");
    return separator > 0 && productFacets.has(filter.slice(0, separator));
  },
  { message: "facetFilters contains an unsupported facet" }
);

const numericFilterValueSchema = z
  .string()
  .regex(
    /^price(?:<=|>=|=|<|>)-?\d+(?:\.\d+)?$/u,
    "numericFilters contains an unsupported filter"
  );

const facetsSchema = z
  .union([z.enum(PRODUCT_FACETS), z.array(z.enum(PRODUCT_FACETS))])
  .transform((facets) => (Array.isArray(facets) ? facets : [facets]));

const searchParametersSchema = z
  .object({
    analytics: z.literal(false).optional(),
    attributesToHighlight: z.array(z.enum(SEARCH_HIT_ATTRIBUTES)).optional(),
    attributesToRetrieve: z.array(z.enum(SEARCH_HIT_ATTRIBUTES)).optional(),
    attributesToSnippet: z.array(z.enum(SEARCH_HIT_ATTRIBUTES)).optional(),
    clickAnalytics: z.literal(false).optional(),
    facetFilters: z
      .array(z.union([facetFilterValueSchema, z.array(facetFilterValueSchema)]))
      .optional(),
    facetName: z.enum(PRODUCT_FACETS).optional(),
    facetQuery: z.string().optional(),
    facets: facetsSchema.optional(),
    highlightPostTag: z.string().optional(),
    highlightPreTag: z.string().optional(),
    hitsPerPage: z.number().int().min(0).max(MAX_HITS_PER_PAGE).optional(),
    maxValuesPerFacet: z
      .number()
      .int()
      .min(1)
      .max(MAX_VALUES_PER_FACET)
      .optional(),
    numericFilters: z
      .array(
        z.union([numericFilterValueSchema, z.array(numericFilterValueSchema)])
      )
      .optional(),
    page: z.number().int().min(0).max(1000).optional(),
    query: z.string().optional(),
    restrictHighlightAndSnippetArrays: z.boolean().optional(),
    snippetEllipsisText: z.string().optional(),
  })
  .strict();

const searchBatchSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            indexName: z.enum(SEARCH_INDEX_ALIASES, {
              errorMap: () => ({
                message: "Search request contains an unknown logical index",
              }),
            }),
            params: searchParametersSchema,
          })
          .strict()
          .superRefine(({ indexName, params }, context) => {
            if (
              indexName === "resources" &&
              (params.facetFilters !== undefined ||
                params.facetName !== undefined ||
                params.facets !== undefined ||
                params.numericFilters !== undefined)
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Resource search does not support facets",
                path: ["params"],
              });
            }
          })
      )
      .min(1, "Search batches must contain at least one request")
      .max(
        MAX_BATCH_SIZE,
        `Search batches must contain at most ${MAX_BATCH_SIZE} requests`
      ),
  })
  .strict();

export class InvalidSearchRequestError extends Error {
  readonly code = "INVALID_SEARCH_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "InvalidSearchRequestError";
  }
}

export function validateSearchBatch(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the HTTP request-body boundary; Zod parses the value before use.
  value: unknown
): SearchBatch {
  const result = searchBatchSchema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) =>
        issue.path.length === 0
          ? issue.message
          : `${issue.path.join(".")}: ${issue.message}`
      )
      .join("; ");
    throw new InvalidSearchRequestError(message);
  }

  return result.data.requests;
}
