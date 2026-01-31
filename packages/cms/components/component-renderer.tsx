/**
 * ComponentRenderer is a component that renders components based on the data supplied.
 *
 * A few ground principles for ComponentRenderer
 *
 * 1. It should accept data and decide which component(s) to render
 * 2. It should allow arrays of data to be passed and handle null/undefined
 * 3. As a proxy, it should let you know if it can't render the component you're asking because you didn't provide enough data.
 * 4. It should be able to render the component(s) with the data you provided.
 * 5. It should skip rendering if component is not found in the componentMap.
 */
import { VB_EmptyBlockParentClass } from "@contentstack/live-preview-utils";
import { DynamicProductCollection } from "@repo/cms/components/blocks/dynamic-product-collection";
import { HeroSection } from "@repo/cms/components/blocks/hero-section";
import type { ComponentProps } from "react";
import type { LivePreviewHelper } from "../lib/utils/live-preview-helper";
import { Locale } from "@repo/i18n";

export const componentMap = {
  HeroSection,
  DynamicProductCollection,
} as const;

type BaseData = {
  __typename: string;
};

type ComponentMapType = typeof componentMap;
type Data = ComponentProps<ComponentMapType[ComponentKey]>["data"];
type ComponentKey = keyof ComponentMapType;
export type DataWithTypename = (Data & BaseData) | BaseData | null;

type GraphQLComponent =
  | (BaseData & {
      [key: string]: unknown;
    })
  | null;

function isComponentKey(key: string): key is ComponentKey {
  return key in componentMap;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: @todo: reduce complexity to 15
function flattenComponentsWithPaths(
  data: GraphQLComponent[],
  livePreviewHelper?: LivePreviewHelper
): Array<{
  data: DataWithTypename;
  componentHelper?: LivePreviewHelper;
}> {
  const result: Array<{
    data: DataWithTypename;
    componentHelper?: LivePreviewHelper;
  }> = [];

  for (let i = 0; i < data.length; i++) {
    const component = data[i];
    if (!component) {
      continue;
    }

    const keys = Object.keys(component).filter((k) => k !== "__typename");
    if (keys.length !== 1 || keys[0] === undefined) {
      continue;
    }

    const [key] = keys;

    const value = component[key];
    const componentHelper = livePreviewHelper?.getNestedHelper(`${i}.${key}`);

    if (Array.isArray(value)) {
      for (let j = 0; j < value.length; j++) {
        const item = value[j];
        if (item != null) {
          result.push({
            data: item as DataWithTypename,
            componentHelper: componentHelper?.getNestedHelper(`${j}`),
          });
        }
      }
    } else if (value != null) {
      result.push({
        data: value as DataWithTypename,
        componentHelper,
      });
    }
  }

  return result;
}

function flattenComponentWithPath(
  component: GraphQLComponent,
  livePreviewHelper?: LivePreviewHelper
): { data: DataWithTypename; componentHelper?: LivePreviewHelper } | null {
  if (!component) {
    return null;
  }

  const entries = Object.entries(component).filter(
    ([k, v]) => k !== "__typename" && v != null
  );

  if (entries.length !== 1 || entries[0] === undefined) {
    return {
      data: component as DataWithTypename,
      componentHelper: livePreviewHelper,
    };
  }

  const [key, value] = entries[0];

  if (typeof value === "object" && !Array.isArray(value)) {
    return {
      // biome-ignore lint/suspicious/noExplicitAny: validated by component fragments
      data: value as any,
      componentHelper: livePreviewHelper?.getNestedHelper(key),
    };
  }

  return {
    data: component as DataWithTypename,
    componentHelper: livePreviewHelper,
  };
}

/**
 * Renders a single or an array of components based on the data supplied.
 *
 * Supports the following data types:
 *  - Standalone component with supplied __typename mapped to a component.
 *  - Array of components with __typename mapped to a component.
 *  - Array of objects with a single key and value representing modular block objects
 *
 * @param data - The data to render.
 * @param livePreviewHelper - The live preview helper.
 * @param skipParentProps - Whether to skip rendering live preview props on the parent element.
 * @param dataType - The data type of the data.
 * @returns The rendered component.
 */
export default function ComponentRenderer<
  T extends DataWithTypename | DataWithTypename[] | GraphQLComponent[],
>({
  data,
  locale,
  livePreviewHelper,
  skipParentProps = false,
  dataType = "standalone",
}: {
  data: T;
  locale: Locale;
  livePreviewHelper?: LivePreviewHelper;
  skipParentProps?: boolean;
  dataType?: "modularBlocks" | "standalone" | "singleModularBlock";
}) {
  if (data === null) {
    return null;
  }

  // Show "add components" in Visual Builder if no components are present.
  if (
    Array.isArray(data) &&
    data.length === 0 &&
    dataType === "modularBlocks"
  ) {
    return (
      <div
        {...livePreviewHelper?.getParentProps()}
        className={VB_EmptyBlockParentClass}
      />
    );
  }

  // Handle modular blocks.
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === "object" &&
    data[0] &&
    "__typename" in data[0] &&
    dataType === "modularBlocks"
  ) {
    const flattenedWithPaths = flattenComponentsWithPaths(
      data as GraphQLComponent[],
      livePreviewHelper
    );

    return (
      <div {...livePreviewHelper?.getParentProps()}>
        {flattenedWithPaths.map(
          ({ data: itemData, componentHelper }, index) => {
            if (itemData === null) {
              return null;
            }
            if (isComponentKey(itemData.__typename)) {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: this is fine for server rendered content.
                <div key={index} {...livePreviewHelper?.getProps(`${index}`)}>
                  <ComponentRenderer
                    locale={locale}
                    data={itemData}
                    livePreviewHelper={componentHelper}
                    skipParentProps={true}
                  />
                </div>
              );
            }
            return null;
          }
        )}
      </div>
    );
  }

  // Handle single modular block using simple path flattening.
  if (
    typeof data === "object" &&
    "__typename" in data &&
    dataType === "singleModularBlock"
  ) {
    const flattened = flattenComponentWithPath(
      data as GraphQLComponent,
      livePreviewHelper
    );

    if (!flattened?.data) {
      return null;
    }

    const { data: itemData, componentHelper } = flattened;

    if (isComponentKey(itemData.__typename)) {
      const Component = componentMap[itemData.__typename];

      return (
        <Component
          /* biome-ignore lint/suspicious/noExplicitAny: -- At this point we know data is one of the accepted props for the component */
          data={itemData as any}
          locale={locale}
          livePreviewHelper={componentHelper}
        />
      );
    }
  }

  // If we have a regular array, we render each item in the array
  if (Array.isArray(data)) {
    return (
      <>
        {data.map((item, index) => {
          if (item === null) {
            return null;
          }
          if (isComponentKey(item.__typename)) {
            return (
              <ComponentRenderer
                locale={locale}
                // biome-ignore lint/suspicious/noArrayIndexKey: this is fine for server rendered content.
                key={index}
                data={item}
                livePreviewHelper={livePreviewHelper?.getNestedHelper(
                  `${index}`
                )}
              />
            );
          }
          return null;
        })}
      </>
    );
  }

  if (isComponentKey(data.__typename)) {
    const Component = componentMap[data.__typename];

    return (
      <div
        className="component-renderer-wrapper"
        {...(skipParentProps ? {} : livePreviewHelper?.getParentProps())}
      >
        <Component
          /* biome-ignore lint/suspicious/noExplicitAny: -- At this point we know data is one of the accepted props for the component */
          data={data as any}
          locale={locale}
          livePreviewHelper={livePreviewHelper}
        />
      </div>
    );
  }

  return null;
}

// Re-export all fragments.
ComponentRenderer.fragments = [
  HeroSection.fragment,
  DynamicProductCollection.fragment,
];
