export const searchSteps = {
  destination: {
    group: "Search",
    title: "Check the credential destination",
    interactive: true,
  },
  contentKey: {
    group: "Search",
    title: "Create or update the scoped content write key",
  },
  searchKey: {
    group: "Search",
    title: "Create or update the scoped runtime search key",
  },
  publication: {
    group: "Search",
    title: "Publish search and content credentials",
  },
} as const;

export function contentIndexStep(
  indexName: string,
  locales: readonly string[]
) {
  return {
    group: "CMS",
    title: `Configure content index "${indexName}" (${locales.join(", ")})`,
  };
}

export function suggestionsStep(indexName: string, locale: string) {
  return {
    group: "Search",
    title: `Configure Query Suggestions "${indexName}" (${locale})`,
  };
}
