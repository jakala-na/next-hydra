type ElementOf<T> = T extends ReadonlyArray<infer E> ? E : T;
type NonTypenameKey<T> = Exclude<keyof T, '__typename'>;
type ExtractPayload<T> = T extends { __typename: string }
  ? {
      [K in NonTypenameKey<T>]: ElementOf<NonNullable<T[K]>>;
    }[NonTypenameKey<T>]
  : never;

/**
 * Flattens Modular Blocks from an array of objects with a single key, to a flat array of objects.
 *
 * Example:
 *
 * ```ts
 * const components = [
 *   { __typename: 'ProductCards',
 *    product_cards: [
 *      { __typename: 'ProductCard', title: 'Product 1', ... },
 *      { __typename: 'ProductCard', title: 'Product 2', ... },
 *    ]
 *   },
 *   { __typename: 'Tabs',
 *    title: 'Tabs',
 *    tabs: [
 *      { __typename: 'Tab', title: 'Tab 1', ... },
 *      { __typename: 'Tab', title: 'Tab 2', ... },
 *    ]
 *   },
 * ]
 *
 * const flattenedComponents = flattenComponents(components);
 *
 * console.log(flattenedComponents);
 * // [
 * //   { __typename: 'ProductCard', title: 'Product 1', ... },
 * //   { __typename: 'ProductCard', title: 'Product 2', ... },
 * //   { __typename: 'Tab', title: 'Tab 1', ... },
 * //   { __typename: 'Tab', title: 'Tab 2', ... },
 * // ]
 * ```
 *
 * @author Written by GPT5, tested by humans.
 *
 * @param components - An array of objects with a single key and __typename.
 * @returns A flat array of objects with the payload of the component.
 */
export function flattenComponents<const W extends { __typename: string }>(
  components: ReadonlyArray<W | null | undefined>
) {
  type Inner = ExtractPayload<W>;

  const result: Inner[] = [] as unknown as Inner[];

  for (const component of components) {
    if (!component) {
      continue;
    }
    const keys = Object.keys(component).filter((k) => k !== '__typename');
    if (keys.length !== 1) {
      continue;
    }
    const key = keys[0] as keyof typeof component;
    const value = (component as unknown as Record<string, unknown>)[
      key as string
    ];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          (result as unknown as unknown[]).push(item);
        }
      }
    } else if (value != null) {
      (result as unknown as unknown[]).push(value);
    }
  }

  return result as unknown as Inner[];
}
