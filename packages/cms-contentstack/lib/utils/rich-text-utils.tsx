import { jsonToHtml } from "@contentstack/json-rte-serializer";
import type { IJsonToHtmlOptions } from "@contentstack/json-rte-serializer";
import parse, { domToReact, Element } from "html-react-parser";
import type { DOMNode, HTMLReactParserOptions } from "html-react-parser";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

type EmbeddedItem = {
  __typename: string;
  title?: string | null;
  url?: string | null;
};

type EmbeddedItemsConnection = {
  edges?:
    | ({
        node?: EmbeddedItem | null;
      } | null)[]
    | null;
};

/**
 * Process JSON RTE content with embedded entries and render as React components
 * @param jsonValue - The JSON RTE content
 * @param embeddedItems - The embedded items connection from GraphQL
 * @returns React nodes with embedded entry links as Next.js Link components
 */
export function renderRichText(
  jsonValue: unknown,
  embeddedItems?: EmbeddedItemsConnection | null
): ReactNode {
  if (jsonValue === undefined || jsonValue === null) {
    return null;
  }

  // Build a lookup map for embedded items
  const embeddedItemsArray =
    embeddedItems?.edges?.map((edge) => edge?.node).filter(Boolean) || [];

  // Track which embedded item we're currently rendering (for order-based matching)
  let embeddedItemIndex = 0;

  const jsonRteConfig: IJsonToHtmlOptions = {
    customElementTypes: {
      reference: (_attrs, child, jsonBlock) => {
        // Check if this is an embedded entry (not an asset)
        if (jsonBlock?.attrs?.type === "entry") {
          const rawHref: unknown = jsonBlock.attrs?.href;
          const href =
            typeof rawHref === "string" && rawHref !== ""
              ? rawHref
              : undefined;

          // Try to get embedded item data from GraphQL
          const embeddedItem = embeddedItemsArray[embeddedItemIndex];
          if (embeddedItem) {
            embeddedItemIndex++;
          }

          // If we have GraphQL embedded item data with URL and title, use it
          if (embeddedItem?.url && embeddedItem?.title) {
            return `<a href="${embeddedItem.url}" class="embedded-entry-link" data-link-type="internal">${embeddedItem.title}</a>`;
          }

          // Fallback: use href from ContentStack JSON and title from embedded item
          if (href !== undefined && embeddedItem?.title) {
            return `<a href="${href}" class="embedded-entry-link" data-link-type="internal">${embeddedItem.title}</a>`;
          }

          // Fallback: use href from ContentStack JSON with path as text
          if (href !== undefined) {
            return `<a href="${href}" class="embedded-entry-link" data-link-type="internal">${child || href}</a>`;
          }

          // Final fallback: return child content
          return child || "";
        }

        // Default reference handling for assets - let default serializer handle it
        return undefined as unknown as string;
      },
    },
  };

  const htmlString = jsonToHtml(jsonValue, jsonRteConfig);

  // Parse HTML and replace embedded entry links with Next.js Link components
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (
        domNode instanceof Element &&
        domNode.name === "a" &&
        (domNode.attribs?.class?.includes("embedded-entry-link") ?? false)
      ) {
        const rawLinkHref = domNode.attribs.href;
        const href =
          rawLinkHref !== undefined && rawLinkHref !== ""
            ? rawLinkHref
            : "#";
        const children = domNode.children as DOMNode[];

        return (
          <Link href={href as Route} className="embedded-entry-link">
            {domToReact(children, options)}
          </Link>
        );
      }
    },
  };

  return parse(htmlString, options);
}
