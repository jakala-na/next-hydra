import { Schema } from "effect";

export class CommercetoolsUnavailable extends Schema.TaggedErrorClass<CommercetoolsUnavailable>()(
  "CommercetoolsUnavailable",
  { cause: Schema.Defect }
) {}

export class CommercetoolsCartNotFound extends Schema.TaggedErrorClass<CommercetoolsCartNotFound>()(
  "CommercetoolsCartNotFound",
  { cartId: Schema.String }
) {}

export class CommercetoolsCartAccessDenied extends Schema.TaggedErrorClass<CommercetoolsCartAccessDenied>()(
  "CommercetoolsCartAccessDenied",
  { cause: Schema.Defect }
) {}

export class CommercetoolsCartVersionConflict extends Schema.TaggedErrorClass<CommercetoolsCartVersionConflict>()(
  "CommercetoolsCartVersionConflict",
  { cause: Schema.Defect }
) {}

export class CommercetoolsCartWriteOutcomeUnknown extends Schema.TaggedErrorClass<CommercetoolsCartWriteOutcomeUnknown>()(
  "CommercetoolsCartWriteOutcomeUnknown",
  { cause: Schema.Defect }
) {}

export class CommercetoolsCartMerchandiseUnavailable extends Schema.TaggedErrorClass<CommercetoolsCartMerchandiseUnavailable>()(
  "CommercetoolsCartMerchandiseUnavailable",
  { cause: Schema.Defect }
) {}

export class CommercetoolsCartCustomTypeConflict extends Schema.TaggedErrorClass<CommercetoolsCartCustomTypeConflict>()(
  "CommercetoolsCartCustomTypeConflict",
  {
    actualTypeKey: Schema.String,
    expectedTypeKey: Schema.String,
  }
) {}
