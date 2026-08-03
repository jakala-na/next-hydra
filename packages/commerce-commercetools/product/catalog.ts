import type {
  CommercetoolsProductSelectionRule,
  CommercetoolsProductVariant,
} from "./client";

const applyRule = (
  variants: readonly CommercetoolsProductVariant[],
  rule: CommercetoolsProductSelectionRule
): readonly CommercetoolsProductVariant[] => {
  if (rule.mode === "IndividualExclusion") {
    if (rule.variantExclusion === null) {
      return [];
    }
    return variants.filter(
      ({ sku }) => !rule.variantExclusion?.skus.includes(sku ?? "")
    );
  }

  if (rule.variantSelection === null) {
    return variants;
  }
  if (rule.variantSelection.type === "includeOnly") {
    return variants.filter(({ sku }) =>
      rule.variantSelection?.skus.includes(sku ?? "")
    );
  }
  return variants.filter(
    ({ sku }) => !rule.variantSelection?.skus.includes(sku ?? "")
  );
};

export const selectEligibleVariants = (
  variants: readonly CommercetoolsProductVariant[],
  rules: readonly CommercetoolsProductSelectionRule[]
): readonly CommercetoolsProductVariant[] => {
  if (rules.length === 0) {
    return [];
  }

  let eligible = variants;
  for (const rule of rules) {
    eligible = applyRule(eligible, rule);
    if (eligible.length === 0) {
      return [];
    }
  }
  return eligible;
};
