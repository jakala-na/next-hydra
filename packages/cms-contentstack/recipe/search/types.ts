/** A recipe's searchable content definition, shared by indexing and instructions. */
export interface SearchContentType {
  readonly uid: string;
  readonly label: string;
  readonly searchTextRoot: string;
  readonly mappingFields: readonly string[];
  readonly instructions: readonly string[];
}

/** A block recipe can extend an existing type without creating another index record. */
export interface SearchContentTypeExtension {
  readonly extend: string;
  readonly instructions: readonly string[];
}

export type SearchContentContribution =
  | SearchContentType
  | SearchContentTypeExtension;

export function resolveSearchContentTypes(
  contributions: readonly SearchContentContribution[]
): readonly SearchContentType[] {
  const types = new Map<string, SearchContentType>();
  for (const contribution of contributions) {
    if ("extend" in contribution) {
      continue;
    }
    if (types.has(contribution.uid)) {
      throw new Error(`Duplicate searchable content type: ${contribution.uid}`);
    }
    types.set(contribution.uid, contribution);
  }
  for (const contribution of contributions) {
    if (!("extend" in contribution)) {
      continue;
    }
    const target = types.get(contribution.extend);
    if (!target) {
      throw new Error(
        `Search instructions extend a missing content type: ${contribution.extend}`
      );
    }
    types.set(target.uid, {
      ...target,
      instructions: [...target.instructions, ...contribution.instructions],
    });
  }
  return [...types.values()];
}
