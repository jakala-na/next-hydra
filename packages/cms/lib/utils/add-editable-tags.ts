import contentstack from '@contentstack/delivery-sdk';

type AddEditableTagsResult<T> = T & {
  $: {
    [K in keyof T]?: Record<string, unknown>;
  };
};

export function addEditableTags<
  T extends { system: { content_type_uid: string | null; uid: string | null; locale: string | null } | null },
>(entry: T, livePreview: false): AddEditableTagsResult<T> {
  if (!(entry.system?.content_type_uid && entry.system?.uid && entry.system?.locale && livePreview)) {
    // Return with empty $ property to satisfy type
    return { ...entry, $: {} } as AddEditableTagsResult<T>;
  }

  const entryWithTags = {
    uid: entry.system.uid,
    _content_type_uid: entry.system.content_type_uid,
    ...entry,
  };

  contentstack.Utils.addEditableTags(entryWithTags, entry.system.content_type_uid, true, entry.system.locale);

  // The Contentstack SDK mutates the entry in-place, so we just return it with the correct type
  return entryWithTags as unknown as AddEditableTagsResult<T>;
}
