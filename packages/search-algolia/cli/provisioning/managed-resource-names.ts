export interface ManagedResourceName {
  readonly legacyNames: readonly string[];
  readonly name: string;
}

const globalResourceName = (
  name: string,
  indexPrefix: string | undefined
): ManagedResourceName => {
  const prefix = indexPrefix?.trim();
  return prefix === undefined || prefix.length === 0
    ? {
        legacyNames: [`${name} (unprefixed)`],
        name,
      }
    : {
        legacyNames: [],
        name: `${name} (${prefix})`,
      };
};

const storeResourceName = (
  name: string,
  indexPrefix: string | undefined,
  storeKey: string
): ManagedResourceName => {
  const prefix = indexPrefix?.trim();
  return prefix === undefined || prefix.length === 0
    ? {
        legacyNames: [`${name} (unprefixed/${storeKey})`],
        name: `${name} (${storeKey})`,
      }
    : {
        legacyNames: [],
        name: `${name} (${prefix}/${storeKey})`,
      };
};

export const managedAlgoliaResourceNames = (
  indexPrefix: string | undefined
) => ({
  algoliaDestinationAuthentication: globalResourceName(
    "Managed Algolia destination authentication",
    indexPrefix
  ),
  commerceApiClient: globalResourceName(
    "Managed Algolia connector",
    indexPrefix
  ),
  commercetoolsAuthentication: globalResourceName(
    "Managed commercetools authentication",
    indexPrefix
  ),
  connectorKey: globalResourceName("Managed connector key", indexPrefix),
  productConnector: (storeKey: string) =>
    storeResourceName("Managed Product connector", indexPrefix, storeKey),
  productTransformationConfiguration: (storeKey: string) =>
    storeResourceName(
      "Managed Product transformation configuration",
      indexPrefix,
      storeKey
    ),
  searchKey: globalResourceName("Managed runtime search key", indexPrefix),
});
