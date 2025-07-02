/* eslint-disable */
/* prettier-ignore */
import type { TadaDocumentNode, $tada } from 'gql.tada';

declare module 'gql.tada' {
 interface setupCache {
    "\n  query getMenu($locale: String!) {\n    all_navigation(locale: $locale) {\n      items {\n        system {\n          uid\n          content_type_uid\n        }\n        title\n        items {\n          text\n          linkConnection {\n            edges {\n              node {\n                ... on Page {\n                  system {\n                    uid\n                    content_type_uid\n                  }\n                  url\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n":
      TadaDocumentNode<{ all_navigation: { items: ({ system: { uid: string | null; content_type_uid: string | null; } | null; title: string | null; items: ({ text: string | null; linkConnection: { edges: ({ node: { __typename?: "Page" | undefined; system: { uid: string | null; content_type_uid: string | null; } | null; url: string | null; } | null; } | null)[] | null; } | null; } | null)[] | null; } | null)[] | null; } | null; }, { locale: string; }, void>;
  }
}
