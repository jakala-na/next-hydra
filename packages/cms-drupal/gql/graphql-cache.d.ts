/* eslint-disable */
/* prettier-ignore */
import type { TadaDocumentNode, $tada } from 'gql.tada';

declare module 'gql.tada' {
 interface setupCache {
    "\n  query DrupalPreviewHandshake($id: ID!, $token: String!) {\n    preview(id: $id, token: $token) {\n      __typename\n      ... on NodeLandingPage {\n        uuid\n        path\n      }\n    }\n  }\n":
      TadaDocumentNode<{ preview: { __typename: "NodeLandingPage"; uuid: string; path: string | null; } | null; }, { token: string; id: string; }, void>;
    "\n  query DrupalMainMenu {\n    menu(name: MAIN) {\n      items {\n        id\n        title\n        description\n        url\n        children {\n          id\n          title\n          description\n          url\n        }\n      }\n    }\n  }\n":
      TadaDocumentNode<{ menu: { items: { id: string; title: string; description: string | null; url: string | null; children: { id: string; title: string; description: string | null; url: string | null; }[]; }[]; } | null; }, {}, void>;
    "\n  fragment DrupalDynamicProductCollection on ParagraphDynamicProductCollection {\n    productHeading: heading\n    productDescription: description\n    productCategory\n  }\n":
      TadaDocumentNode<{ productHeading: string | null; productDescription: string | null; productCategory: string | null; }, {}, { fragment: "DrupalDynamicProductCollection"; on: "ParagraphDynamicProductCollection"; masked: true; }>;
    "\n  fragment DrupalHeroSection on ParagraphHero {\n    tagline\n    heroHeading: heading\n    heroDescription: description\n    actions {\n      title\n      url\n    }\n    image {\n      __typename\n      ... on MediaImage {\n        mediaImage {\n          url\n          width\n          height\n          alt\n        }\n      }\n    }\n  }\n":
      TadaDocumentNode<{ tagline: string | null; heroHeading: string; heroDescription: string; actions: { title: string | null; url: string | null; }[] | null; image: { __typename: "MediaImage"; mediaImage: { url: string; width: number; height: number; alt: string | null; }; }; }, {}, { fragment: "DrupalHeroSection"; on: "ParagraphHero"; masked: true; }>;
    "\n    fragment DrupalLandingPage on NodeLandingPage {\n      __typename\n      id\n      title\n      displayTitle\n      hideDisplayTitle\n      components {\n        __typename\n        ... on ParagraphInterface {\n          id\n        }\n        ...DrupalHeroSection\n        ...DrupalDynamicProductCollection\n      }\n    }\n  ":
      TadaDocumentNode<{ __typename: "NodeLandingPage"; id: string; title: string; displayTitle: string | null; hideDisplayTitle: boolean | null; components: ({ __typename: "ParagraphDynamicProductCollection"; id: string; [$tada.fragmentRefs]: { DrupalDynamicProductCollection: "ParagraphDynamicProductCollection"; }; } | { __typename: "ParagraphHero"; id: string; [$tada.fragmentRefs]: { DrupalHeroSection: "ParagraphHero"; }; })[] | null; }, {}, { fragment: "DrupalLandingPage"; on: "NodeLandingPage"; masked: true; }>;
    "\n    query DrupalRoute($path: String!, $revision: ID) {\n      route(path: $path, revision: $revision) {\n        __typename\n        ... on RouteInternal {\n          entity {\n            __typename\n            ... on NodeInterface {\n              id\n            }\n            ...DrupalLandingPage\n          }\n        }\n      }\n    }\n  ":
      TadaDocumentNode<{ route: { __typename: "RouteExternal"; } | { __typename: "RouteInternal"; entity: { __typename: "NodeLandingPage"; id: string; [$tada.fragmentRefs]: { DrupalLandingPage: "NodeLandingPage"; }; } | null; } | null; }, { revision?: string | null | undefined; path: string; }, void>;
    "\n    query DrupalPagePreview($id: ID!, $token: String!) {\n      preview(id: $id, token: $token) {\n        __typename\n        ... on NodeInterface {\n          id\n        }\n        ...DrupalLandingPage\n      }\n    }\n  ":
      TadaDocumentNode<{ preview: { __typename: "NodeLandingPage"; id: string; [$tada.fragmentRefs]: { DrupalLandingPage: "NodeLandingPage"; }; } | null; }, { token: string; id: string; }, void>;
  }
}
