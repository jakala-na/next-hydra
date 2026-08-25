import { graphql, readFragment } from "../../graphql";
import type { FragmentOf } from "../../graphql";

export const TabsFragment = graphql(`
  fragment Tabs on Tabs {
    heading
    tabs {
      __typename
      ... on TabsTabsTab {
        tab {
          label
          content {
            __typename
            ... on TabsTabsTabBlockContentRichText {
              rich_text {
                content {
                  json
                }
              }
            }
            ... on TabsTabsTabBlockContentCardCollection {
              card_collection {
                contentConnection {
                  __typename
                  edges {
                    node {
                      __typename
                      ... on Product {
                        title
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    styling {
      background_pattern
      background_and_field_pattern_color
    }
  }
`);

export function Tabs(props: { data: FragmentOf<typeof TabsFragment> }) {
  const data = readFragment(TabsFragment, props.data);

  return JSON.stringify(data, null, 2);
}

Tabs.fragment = TabsFragment;
