import type { ProductSelectionRule } from "../../store/types";

/**
 * Filters product variants based on Product Selection rules.
 * Applies variant inclusion/exclusion rules from Product Selections.
 *
 * Product selection rules:
 * Mode: Individual - include variants (add)
 *   - All Variants
 *     - If variantSelection is null, all variants are allowed
 *   - Variant selection - (includeOnly)
 *     - If variant selection type is includeOnly and skus are present, only variants with the given SKUs are allowed
 *   - Variant selection - (includeAllExcept)
 *     - If variant selection type is includeAllExcept and skus are present, all variants except the ones with the given SKUs are allowed
 * Mode: IndividualExclusion - exclude variants (remove)
 *   - All Variants
 *     - If variantExclusion is null, all variants are excludes (removed)
 *   - Variant exclusion -
 *     - If variant exclusion skus are present, given SKUs are excluded
 *
 * @param variants - Array of product variants to filter
 * @param productSelections - Product Selection rules for this product
 * @returns Filtered array of variants
 */
export function filterVariantsByProductSelections<
  T extends { sku: string | null },
>(variants: T[], productSelections: ProductSelectionRule[]): T[] {
  if (productSelections.length === 0) {
    // Return no variants if they are not assigned to a store.
    return [];
  }

  let filteredVariants = variants;

  // Apply each product selection rule
  for (const rule of productSelections) {
    filteredVariants = filterByRule(filteredVariants, rule);
    // Stop if no variants are left.
    if (filteredVariants.length === 0) {
      return [];
    }
  }

  return filteredVariants;
}

/**
 * Applies a single Product Selection rule to variants.
 */
function filterByRule<T extends { sku: string | null }>(
  variants: T[],
  rule: ProductSelectionRule
): T[] {
  const { variantSelection, variantExclusion, mode } = rule;

  // Handle variant exclusion (IndividualExclusion mode)
  if (mode === "IndividualExclusion") {
    if (variantExclusion === null) {
      // If no variants specified, exclude all variants.
      return [];
    }

    // Leave only variants that are not in the exclusion list.
    return variants.filter(
      (variant) => !variantExclusion.skus.includes(variant.sku || "")
    );
  }

  // Handle variant selection (Individual mode)
  if (mode === "Individual") {
    if (variantSelection === null) {
      // If no variants specified, include all variants.
      return variants;
    }

    if (variantSelection.type === "includeOnly") {
      // Include only variants with SKUs in the selection
      return variants.filter((variant) =>
        variantSelection.skus.includes(variant.sku || "")
      );
    }
    if (variantSelection.type === "includeAllExcept") {
      // Include all variants except those with SKUs in the selection
      return variants.filter(
        (variant) => !variantSelection.skus.includes(variant.sku || "")
      );
    }
  }

  // We should always have a return by now, but if we landed on a new rule, return no variants.
  return [];
}
