import { HeroSection as HeroSectionComponent } from "@repo/design-system/components/cms/blocks/hero-section";
import type { Locale } from "@repo/i18n";

import { graphql, readFragment } from "../../graphql";
import type { FragmentOf } from "../../graphql";
import { getNodesFromConnection } from "../../lib/utils/connection";
import { renderRichText } from "../../lib/utils/rich-text-utils";
import type { ComponentBaseProps } from "../../types";
import getLinkProps from "../link";

export const HeroSectionFragment = graphql(`
  fragment HeroSection on HeroSection {
    tagline
    title
    description {
      json
    }
    imageConnection {
      edges {
        node {
          ... on SysAsset {
            url
            dimension {
              width
              height
            }
          }
        }
      }
    }
    image_alt
    cta {
      label
      internal_contentConnection {
        edges {
          node {
            ... on LandingPage {
              url
              title
            }
          }
        }
      }
      external_url
    }
  }
`);

export function HeroSection(
  props: {
    data: FragmentOf<typeof HeroSectionFragment>;
    locale: Locale;
  } & ComponentBaseProps
) {
  const { livePreviewHelper } = props;
  const data = readFragment(HeroSectionFragment, props.data);

  const livePreviewProps = livePreviewHelper?.getUIProps({
    cta: "cta",
    description: "description",
    image: "image",
    tagline: "tagline",
    title: "title",
  });

  const image = getNodesFromConnection(data.imageConnection).map((node) => ({
    altText: data.image_alt || "",
    height: node?.dimension?.height ?? undefined,
    url: node?.url || "",
    width: node?.dimension?.width ?? undefined,
  }))[0];

  return (
    <HeroSectionComponent
      image={image}
      ctaLinks={getLinkProps(data.cta)}
      tagline={data.tagline ?? ""}
      title={data.title ?? ""}
      description={renderRichText(data.description?.json)}
      livePreviewProps={livePreviewProps}
    />
  );
}

HeroSection.fragment = HeroSectionFragment;
