import { Schema } from "effect";

export const CompanyRole = Schema.Literals(["owner", "associate"]);
export type CompanyRole = typeof CompanyRole.Type;

export const CompanyMemberInvitationRole = Schema.Literal("associate");
export type CompanyMemberInvitationRole =
  typeof CompanyMemberInvitationRole.Type;
