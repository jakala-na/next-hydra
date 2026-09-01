export const minorAmountFromDecimal = (amount: string): string => {
  const match = /^(?<units>0|[1-9]\d*)(?:\.(?<fraction>\d{1,2}))?$/u.exec(
    amount
  );
  if (match?.groups === undefined) {
    throw new Error(
      `Expected a non-negative monetary amount, received ${amount}`
    );
  }

  const units = BigInt(match.groups.units ?? "0");
  const fraction = (match.groups.fraction ?? "").padEnd(2, "0");
  return (units * 100n + BigInt(fraction || "0")).toString();
};

export const matchesVariantAttributes = (
  actual: readonly { readonly name: string; readonly value: string }[],
  expected: ReadonlyMap<string, string>
): boolean => {
  if (actual.length !== expected.size) {
    return false;
  }

  const actualByName = new Map<string, string>(
    actual.map(({ name, value }) => [name, value])
  );
  if (actualByName.size !== actual.length) {
    return false;
  }
  return [...expected].every(
    ([attribute, value]) => actualByName.get(attribute) === value
  );
};
