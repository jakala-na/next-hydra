import type { DataTable } from "@repo/e2e-testing";

export const rowsWithHeaders = (
  dataTable: DataTable,
  expectedHeaders: readonly string[]
): readonly ReadonlyMap<string, string>[] => {
  const [headers, ...rows] = dataTable.raw();
  if (
    headers?.length !== expectedHeaders.length ||
    expectedHeaders.some((header, index) => headers[index] !== header)
  ) {
    throw new Error(`Expected table headers ${expectedHeaders.join(", ")}`);
  }

  return rows.map((row) => {
    if (row.length !== expectedHeaders.length) {
      throw new Error(
        `Each table row must contain ${expectedHeaders.length} values`
      );
    }
    return new Map(
      expectedHeaders.map((header, index) => [header, row[index] ?? ""])
    );
  });
};
