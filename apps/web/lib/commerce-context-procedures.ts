import { NextServer } from "@repo/actions/next-server";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  BUSINESS_UNIT_COOKIE_OPTIONS,
} from "@repo/commerce/commerce-context/business-unit-cookie";
import { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import { Effect, Option, Schema } from "effect";

import { NextRequestApi } from "./next-request-api";

/** Reserved channel for ActionClient; invalid selectors currently no-op. */
export class SelectBusinessUnitActionError extends Schema.TaggedErrorClass<SelectBusinessUnitActionError>()(
  "SelectBusinessUnitActionError",
  {
    message: Schema.String,
  }
) {}

export const SelectBusinessUnitInput = Schema.String;

export const selectBusinessUnitProgram = Effect.fn(
  "BuyingContext.selectBusinessUnit"
)(function* (businessUnitId: string) {
  const selectedBusinessUnitId = Option.getOrUndefined(
    Schema.decodeUnknownOption(CommerceBusinessUnitId)(businessUnitId)
  );
  if (selectedBusinessUnitId === undefined) {
    return null;
  }

  const request = yield* NextRequestApi;
  const cookieStore = yield* request.getCookies();
  const next = yield* NextServer;

  yield* Effect.sync(() => {
    cookieStore.set(
      BUSINESS_UNIT_COOKIE_NAME,
      selectedBusinessUnitId,
      BUSINESS_UNIT_COOKIE_OPTIONS
    );
  });
  yield* next.refresh();
  return null;
});
