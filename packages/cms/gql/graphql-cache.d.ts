/* eslint-disable */
/* prettier-ignore */
import type { TadaDocumentNode, $tada } from 'gql.tada';

declare module 'gql.tada' {
 interface setupCache {
    "\n    fragment ProductCards on ProductCards {\n        title\n        category\n    }\n":
      TadaDocumentNode<{ title: string | null; category: unknown; }, {}, { fragment: "ProductCards"; on: "ProductCards"; masked: true; }>;
    "\n      query PageQuery($url: String, $locale: String) {\n        all_page(locale: $locale, fallback_locale: true, limit: 1, where:  {\n           url: $url\n        }) {\n        items {\n          title\n          url\n          components {\n            ... on PageComponentsProductCards {\n                product_cards {\n                    ... ProductCards\n                }\n            }\n          }\n          system {\n            uid\n            content_type_uid\n            locale\n          }\n        }\n      }\n      }\n    ":
      TadaDocumentNode<{ all_page: { items: ({ title: string | null; url: string | null; components: ({ __typename?: "PageComponentsProductCards" | undefined; product_cards: { [$tada.fragmentRefs]: { ProductCards: "ProductCards"; }; } | null; } | { __typename?: "PageComponentsTextBlock" | undefined; } | null)[] | null; system: { uid: string | null; content_type_uid: string | null; locale: string | null; } | null; } | null)[] | null; } | null; }, { locale?: string | null | undefined; url?: string | null | undefined; }, void>;
    "\n  query getMenu($locale: String!) {\n    all_navigation(locale: $locale, fallback_locale: true) {\n      items {\n        system {\n          uid\n          content_type_uid\n        }\n        title\n        items {\n          text\n          linkConnection {\n            edges {\n              node {\n                ... on Page {\n                  system {\n                    uid\n                    content_type_uid\n                  }\n                  url\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n":
      TadaDocumentNode<{ all_navigation: { items: ({ system: { uid: string | null; content_type_uid: string | null; } | null; title: string | null; items: ({ text: string | null; linkConnection: { edges: ({ node: { __typename?: "Page" | undefined; system: { uid: string | null; content_type_uid: string | null; } | null; url: string | null; } | null; } | null)[] | null; } | null; } | null)[] | null; } | null)[] | null; } | null; }, { locale: string; }, void>;
  }
}
