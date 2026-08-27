import { Schema } from "effect";

export class IdentityMembershipProjectionFailure extends Schema.TaggedError<IdentityMembershipProjectionFailure>()(
  "IdentityMembershipProjectionFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["project", "remove"]),
    reason: Schema.Literal("unavailable"),
  }
) {}
