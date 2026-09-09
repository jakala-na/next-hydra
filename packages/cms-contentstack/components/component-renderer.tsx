import {
  componentFragments,
  componentMap,
} from "@composition/cms-contentstack/component-registry";
import type { landingPageQuery } from "@composition/cms-contentstack/pages/landing-page-query";
import { VB_EmptyBlockParentClass } from "@contentstack/live-preview-utils";
import type { Locale } from "@repo/i18n";
import { createElement } from "react";
import type { ComponentProps, ReactNode } from "react";

import type { ResultOf } from "../graphql";
import type { LivePreviewHelper } from "../lib/utils/live-preview-helper";

export { componentMap } from "@composition/cms-contentstack/component-registry";

type ComponentKey = keyof typeof componentMap;
type DataMap = {
  [K in ComponentKey]: ComponentProps<(typeof componentMap)[K]>["data"];
};
type Block<K extends ComponentKey = ComponentKey> = {
  [P in K]: DataMap[P] & { __typename: P };
}[K];
export type DataWithTypename = Block | null;
type Page = NonNullable<
  NonNullable<ResultOf<typeof landingPageQuery>["all_landing_page"]>["items"]
>[number];
type ModularBlock = NonNullable<NonNullable<Page>["components"]>[number];
type Keys<T> = T extends object ? keyof T : never;
type Field<T, K extends PropertyKey> = T extends object
  ? K extends keyof T
    ? T[K]
    : never
  : never;
type ModularFields = {
  [K in Exclude<Keys<ModularBlock>, "__typename">]?: Field<ModularBlock, K>;
};
type CommonProps = {
  locale: Locale;
  livePreviewHelper?: LivePreviewHelper;
  skipParentProps?: boolean;
};
type Props = CommonProps &
  (
    | { dataType: "modularBlocks"; data: ModularBlock[] | null }
    | { dataType: "singleModularBlock"; data: ModularBlock }
    | { dataType?: "standalone"; data: DataWithTypename | DataWithTypename[] }
  );
const renderers: {
  [K in ComponentKey]: (props: {
    data: DataMap[K];
    locale: Locale;
    livePreviewHelper?: LivePreviewHelper;
  }) => ReactNode;
} = componentMap;

function renderBlock<K extends ComponentKey>(
  data: Block<K>,
  props: CommonProps
) {
  if (!Object.hasOwn(renderers, data.__typename)) {
    return null;
  }
  return createElement(renderers[data.__typename], {
    data,
    locale: props.locale,
    livePreviewHelper: props.livePreviewHelper,
  });
}

function flattenFields(
  fields: ModularFields,
  livePreviewHelper?: LivePreviewHelper
) {
  return Object.entries(fields).flatMap(([field, data]) =>
    data
      ? [{ data, livePreviewHelper: livePreviewHelper?.getNestedHelper(field) }]
      : []
  );
}

function flattenModularBlock(
  block: ModularBlock,
  livePreviewHelper?: LivePreviewHelper
) {
  if (block === null || block === undefined) {
    return [];
  }
  const { __typename, ...fields } = block;
  return flattenFields(fields, livePreviewHelper);
}

/** Query-derived block data keeps the selected typename and fragment correlated. */
export default function ComponentRenderer(props: Props) {
  if (props.data === null || props.data === undefined) {
    return null;
  }
  if (props.dataType === "modularBlocks") {
    if (props.data.length === 0) {
      return (
        <div
          {...props.livePreviewHelper?.getParentProps()}
          className={VB_EmptyBlockParentClass}
        />
      );
    }
    const blocks = props.data.flatMap((block, index) =>
      flattenModularBlock(
        block,
        props.livePreviewHelper?.getNestedHelper(`${index}`)
      )
    );
    return (
      <div {...props.livePreviewHelper?.getParentProps()}>
        {blocks.map((block, index) => (
          <div
            key={`${block.data.__typename}-${index}`}
            {...props.livePreviewHelper?.getProps(`${index}`)}
          >
            <ComponentRenderer
              data={block.data}
              locale={props.locale}
              livePreviewHelper={block.livePreviewHelper}
              skipParentProps
            />
          </div>
        ))}
      </div>
    );
  }
  if (props.dataType === "singleModularBlock") {
    const [block] = flattenModularBlock(props.data, props.livePreviewHelper);
    return block
      ? renderBlock(block.data, {
          ...props,
          livePreviewHelper: block.livePreviewHelper,
        })
      : null;
  }
  if (Array.isArray(props.data)) {
    return props.data.map((data, index) =>
      data ? (
        <ComponentRenderer
          key={`${data.__typename}-${index}`}
          data={data}
          locale={props.locale}
          livePreviewHelper={props.livePreviewHelper?.getNestedHelper(
            `${index}`
          )}
        />
      ) : null
    );
  }
  const content = renderBlock(props.data, props);
  const parentProps = props.skipParentProps
    ? undefined
    : props.livePreviewHelper?.getParentProps();
  return (
    <div className="component-renderer-wrapper" {...parentProps}>
      {content}
    </div>
  );
}

ComponentRenderer.fragments = componentFragments;
