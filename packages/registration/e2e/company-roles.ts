import type { DataTable } from "@repo/e2e-testing";

import type { CompanyRole } from "../domain/roles";

export const COMPANY_ROLE_LABELS = ["Admin", "Buyer", "Approver"] as const;

export type CompanyRoleLabel = (typeof COMPANY_ROLE_LABELS)[number];

const COMPANY_ROLES_BY_LABEL = {
  Admin: "admin",
  Approver: "approver",
  Buyer: "buyer",
} as const satisfies Record<CompanyRoleLabel, CompanyRole>;

export const companyRoleLabel = (value: string): CompanyRoleLabel => {
  const role = COMPANY_ROLE_LABELS.find(
    (candidate) => candidate.toLowerCase() === value.toLowerCase()
  );
  if (role === undefined) {
    throw new Error(`Unknown Company Role: ${value}`);
  }
  return role;
};

export const companyRole = (value: string): CompanyRole =>
  COMPANY_ROLES_BY_LABEL[companyRoleLabel(value)];

export const companyRoleLabelsFrom = (
  dataTable: DataTable
): readonly CompanyRoleLabel[] => {
  const roles = dataTable.raw().map((row) => {
    const [value, ...unexpectedValues] = row;
    if (value === undefined || unexpectedValues.length > 0) {
      throw new Error("Company Roles must be a one-column table");
    }
    return companyRoleLabel(value);
  });

  if (roles.length === 0) {
    throw new Error("At least one Company Role is required");
  }
  if (new Set(roles).size !== roles.length) {
    throw new Error("Company Roles must not contain duplicates");
  }
  return roles;
};
