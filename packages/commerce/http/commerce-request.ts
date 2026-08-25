import { Schema } from "effect";

import { CommerceBusinessUnitId } from "../domain/commerce-account";
import { CommerceLocale } from "../store";

export class CommerceRequestHeaders extends Schema.Class<CommerceRequestHeaders>(
  "CommerceRequestHeaders"
)({
  "x-context-business-unit-id": Schema.optional(CommerceBusinessUnitId),
  "x-context-locale": CommerceLocale,
}) {}
