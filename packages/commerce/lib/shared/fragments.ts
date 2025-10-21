import { graphql } from "@repo/commerce/graphql";

export const channelFragment = graphql(`
  fragment Channel on Channel {
    id
    key
    version
    name(locale: $locale)
  }
`);
