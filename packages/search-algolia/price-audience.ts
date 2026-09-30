export const PUBLIC_PRICE_AUDIENCE_ID = "public";

export const parsePriceCustomerGroupIds = (
  value: string | undefined
): readonly string[] => [
  ...new Set(
    (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  ),
];

export const resolvePriceAudienceIds = (
  audienceIds: readonly string[],
  configuredCustomerGroupIds: readonly string[]
): readonly string[] => {
  const allowed = new Set(configuredCustomerGroupIds);
  const matching = audienceIds.filter((id) => allowed.has(id));
  return matching.length === 0 ? [PUBLIC_PRICE_AUDIENCE_ID] : matching;
};
