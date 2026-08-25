import { Schema } from "effect";

export const COMPANY_ROLES = ["admin", "buyer", "approver"] as const;

export const CompanyRole = Schema.Literals(COMPANY_ROLES);
export type CompanyRole = typeof CompanyRole.Type;

export const CompanyRoles = Schema.NonEmptyArray(CompanyRole).check(
  Schema.isUnique()
);
export type CompanyRoles = typeof CompanyRoles.Type;

export const INITIAL_COMPANY_ROLES: CompanyRoles = ["admin", "buyer"];

export const hasCompanyRole = (
  roles: readonly CompanyRole[],
  role: CompanyRole
) => roles.includes(role);

export const sameCompanyRoles = (
  left: readonly CompanyRole[],
  right: readonly CompanyRole[]
) => left.length === right.length && left.every((role) => right.includes(role));
