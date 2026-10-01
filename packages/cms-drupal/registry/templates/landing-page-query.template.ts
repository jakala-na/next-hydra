import { graphql } from "../../graphql";
/*{% echo imports %}*/

export const landingPageFragment = graphql(
  `
    fragment DrupalLandingPage on NodeLandingPage {
      __typename
      id
      title
      displayTitle
      hideDisplayTitle
      components {
        __typename
        ... on ParagraphInterface {
          id
        }
        /*{% echo slots.pageBlocks.spreads %}*/
      }
    }
  `,
  [/*{% echo slots.pageBlocks.documents %}*/]
);
