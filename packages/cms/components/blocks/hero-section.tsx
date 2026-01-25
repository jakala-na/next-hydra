import { type FragmentOf, graphql, readFragment } from "@repo/cms/graphql";
import { getNodesFromConnection } from "@repo/cms/lib/utils/connection";
import { renderRichText } from "@repo/cms/lib/utils/rich-text-utils";
import type { ComponentBaseProps } from "@repo/cms/types";
import { HeroSection as HeroSectionComponent } from "@repo/design-system/components/cms/blocks/hero-section";
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
  } & ComponentBaseProps
) {
  const { livePreviewHelper } = props;
  const data = readFragment(HeroSectionFragment, props.data);

  const livePreviewProps = livePreviewHelper?.getUIProps({
    tagline: "tagline",
    title: "title",
    description: "description",
    image: "image",
    cta: "cta",
  });

  const image = getNodesFromConnection(data.imageConnection).map((node) => ({
    url: node?.url || "",
    altText: data.image_alt || "",
    width: node?.dimension?.width ?? undefined,
    height: node?.dimension?.height ?? undefined,
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
