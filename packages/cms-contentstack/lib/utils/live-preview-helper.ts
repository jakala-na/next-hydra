export type LivePreviewHelper = {
  prefix: string;
  getProps: (key: string) => { "data-cslp": string };
  getNestedHelper: (key: string) => LivePreviewHelper;
  getParentProps: () => { "data-cslp": string };
  getUIProps: <T extends Record<string, string>>(
    mapping: T
  ) => { root: Record<string, string> } & {
    [K in keyof T]: Record<string, string>;
  };
};

export function entryLivePreview<
  T extends {
    system: {
      content_type_uid: string | null;
      uid: string | null;
      locale: string | null;
    } | null;
  },
>(entry: T, livePreview: boolean): LivePreviewHelper | undefined {
  if (
    !(
      entry.system?.content_type_uid &&
      entry.system?.uid &&
      entry.system?.locale &&
      livePreview
    )
  ) {
    return;
  }

  const prefix = `${entry.system.content_type_uid}.${entry.system.uid}.${entry.system.locale}`;

  const createLivePreviewHelper = (
    currentPrefix: string
  ): LivePreviewHelper => ({
    getNestedHelper: (key: string) =>
      createLivePreviewHelper(`${currentPrefix}.${key}`),
    getParentProps: () => ({
      "data-cslp": currentPrefix,
    }),
    getProps: (key: string) => ({
      "data-cslp": `${currentPrefix}.${key}`,
    }),
    /**
     * Maps design system field names (keys) to CMS field names (values) and returns an object with live preview props for each field.
     *
     * @param mapping - A mapping of UI field names to CMS field names.
     * @returns An object with live preview attributes for each UI field name, including a root property.
     *
     * @example
     * ```typescript
     * const livePreviewProps = livePreviewHelper.getUIProps({
     *   title: 'title',
     *   description: 'description_richtext',
     * });
     *
     * // Result:
     * // {
     * //   root: { 'data-cslp': 'blog_post.123.en-us' },
     * //   title: { 'data-cslp': 'blog_post.123.en-us.title' },
     * //   description: { 'data-cslp': 'blog_post.123.en-us.description_richtext' }
     * // }
     * ```
     */
    getUIProps: (mapping) => {
      const result: Record<string, Record<string, string>> = {
        root: { "data-cslp": currentPrefix },
      };

      for (const fieldName of Object.keys(mapping)) {
        const cmsFieldName = mapping[fieldName as keyof typeof mapping];
        result[fieldName] = cmsFieldName
          ? { "data-cslp": `${currentPrefix}.${cmsFieldName}` }
          : {};
      }

      return result as { root: Record<string, string> } & {
        [K in keyof typeof mapping]: Record<string, string>;
      };
    },
    prefix: currentPrefix,
  });

  // Return the helper object with the current prefix
  return createLivePreviewHelper(prefix);
}
