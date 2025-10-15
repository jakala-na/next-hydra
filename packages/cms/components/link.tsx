import { getNodesFromConnection } from "../lib/utils/connection";

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
export default function getLinkProps(
  cta: CMSLinkInput[] | null | undefined
): LinkProps[] {
  return (
    cta
      ?.filter((i) => i !== null)
      .map((ctaItem) => ({
        label: ctaItem.label ?? "",
        url:
          getNodesFromConnection(ctaItem.internal_contentConnection)?.[0]
            ?.url ||
          ctaItem.external_url ||
          "",
      })) || []
  );
}
