import type { Locale } from "@repo/i18n";
import { createElement } from "react";
import type { ComponentProps, ReactNode } from "react";

import type { ResultOf } from "../graphql";
import { componentMap, componentFragments } from "./component-registry";
import type { landingPageFragment } from "./pages/landing-page-query";

export { componentMap } from "./component-registry";

type ComponentMap = typeof componentMap;
type ComponentKey = keyof ComponentMap;
type DataMap = {
  [K in ComponentKey]: ComponentProps<ComponentMap[K]["Component"]>["data"];
};
type Block<K extends ComponentKey = ComponentKey> = {
  [P in K]: DataMap[P] & { __typename: P; id: string };
}[K];
export type DataWithTypename =
  | NonNullable<ResultOf<typeof landingPageFragment>["components"]>[number]
  | null
  | undefined;
const definitions: {
  [K in ComponentKey]: {
    Component: (props: { data: DataMap[K]; locale: Locale }) => ReactNode;
    getCacheTags: (data: DataMap[K]) => string[];
  };
} = componentMap;

function isSupportedBlock(data: NonNullable<DataWithTypename>): data is Block {
  return Object.hasOwn(componentMap, data.__typename);
}

function renderBlock<K extends ComponentKey>(data: Block<K>, locale: Locale) {
  return createElement(definitions[data.__typename].Component, {
    data,
    locale,
  });
}

function blockCacheTags<K extends ComponentKey>(data: Block<K>) {
  return definitions[data.__typename].getCacheTags(data);
}

type ComponentRendererProps = {
  data: DataWithTypename | DataWithTypename[];
  locale: Locale;
};

export default function ComponentRenderer({
  data,
  locale,
}: ComponentRendererProps) {
  if (data === null || data === undefined) {
    return null;
  }

  if (Array.isArray(data)) {
    return (
      <>
        {data.map((item) => {
          if (item === null || item === undefined || !isSupportedBlock(item)) {
            return null;
          }

          return (
            <div key={item.id}>
              <ComponentRenderer data={item} locale={locale} />
            </div>
          );
        })}
      </>
    );
  }

  if (!isSupportedBlock(data)) {
    return null;
  }

  return renderBlock(data, locale);
}

ComponentRenderer.fragments = componentFragments;

ComponentRenderer.getCacheTags = (
  data: DataWithTypename | DataWithTypename[]
): string[] => {
  if (data === null || data === undefined) {
    return [];
  }

  if (Array.isArray(data)) {
    return data.flatMap((item) => ComponentRenderer.getCacheTags(item));
  }

  if (!isSupportedBlock(data)) {
    return [];
  }

  return blockCacheTags(data);
};
