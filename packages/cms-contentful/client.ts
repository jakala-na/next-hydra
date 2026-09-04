/**
 * Server-only Contentful GraphQL client.
 */

import "server-only";
import { keys } from "./keys";

type GraphqlError = {
  readonly message?: string;
};

type GraphqlResponse<Data> = {
  readonly data?: Data;
  readonly errors?: readonly GraphqlError[];
};

const contentfulEndpoint = (spaceId: string, environment: string) =>
  `https://graphql.contentful.com/content/v1/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environment)}`;

export async function queryContentful<Data>(
  query: string,
  variables: Readonly<Record<string, boolean | number | string>>,
  preview: boolean
): Promise<Data> {
  const config = keys();
  const token = preview
    ? config.CONTENTFUL_PREVIEW_TOKEN
    : config.CONTENTFUL_DELIVERY_TOKEN;
  const cacheOptions = preview
    ? { cache: "no-store" as const }
    : {
        cache: "force-cache" as const,
        next: {
          revalidate: 3600,
          tags: ["contentful"],
        },
      };
  const response = await fetch(
    contentfulEndpoint(
      config.CONTENTFUL_SPACE_ID,
      config.CONTENTFUL_ENVIRONMENT
    ),
    {
      body: JSON.stringify({ query, variables }),
      ...cacheOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion -- SAFETY: Contentful's GraphQL endpoint returns this standard envelope; errors and missing data are checked before data is returned.
  const result = (await response.json()) as GraphqlResponse<Data>;
  if (result.errors && result.errors.length > 0) {
    throw new Error(
      `Contentful GraphQL request failed: ${result.errors
        .map(({ message }) => message ?? "Unknown GraphQL error")
        .join("; ")}`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Contentful GraphQL request failed with status ${response.status}`
    );
  }
  if (result.data === undefined) {
    throw new Error("Contentful GraphQL response did not contain data");
  }

  return result.data;
}
