import { getNodesFromConnection } from "../lib/utils/connection";

const hasValue = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== "";

type CMSLinkInput = {
  label: string | null;
  external_url: string | null;
  internal_contentConnection: {
    edges: ({ node: { url: string | null } | null } | null)[] | null;
  } | null;
} | null;

type LinkProps = {
  label: string;
  url: string;
};

/**
 * Extracts link properties from CMSLinkInput
 * @param cta - The CTA or link fields input from GraphQL
 * @returns LinkProps for the CTA or link fields
 *
 * @example
 * ```ts
 * const linkProps = getLinkProps(cta);
 * // LinkProps for the CTA or link fields
 * ```
 */

// Overload for single input
export default function getLinkProps(cta: CMSLinkInput): LinkProps;

// Overload for array input
export default function getLinkProps(
  cta: CMSLinkInput[] | null | undefined
): LinkProps[];

// Implementation
export default function getLinkProps(
  cta: CMSLinkInput | CMSLinkInput[] | null | undefined
): LinkProps | LinkProps[] {
  // Handle single input (non-array)
  if (cta && !Array.isArray(cta)) {
    return {
      label: cta.label ?? "",
      url: (() => {
        const connectionUrl = getNodesFromConnection(
          cta.internal_contentConnection
        )?.[0]?.url;
        return hasValue(connectionUrl)
          ? connectionUrl
          : hasValue(cta.external_url)
            ? cta.external_url
            : "";
      })(),
    };
  }

  // Handle array input (or null/undefined)
  return Array.isArray(cta)
    ? cta
        .filter((i) => i !== null)
        .map((ctaItem) => {
          const connectionUrl = getNodesFromConnection(
            ctaItem.internal_contentConnection
          )?.[0]?.url;
          return {
            label: ctaItem.label ?? "",
            url: hasValue(connectionUrl)
              ? connectionUrl
              : hasValue(ctaItem.external_url)
                ? ctaItem.external_url
                : "",
          };
        })
    : [];
}
