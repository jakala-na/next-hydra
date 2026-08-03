"use server";

import { Option, Schema } from "effect";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { CommerceBusinessUnitId } from "../domain/commerce-account";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  BUSINESS_UNIT_COOKIE_OPTIONS,
} from "./business-unit-cookie";

export async function selectBusinessUnit(
  businessUnitId: string
): Promise<void> {
  const selectedBusinessUnitId = Option.getOrUndefined(
    Schema.decodeUnknownOption(CommerceBusinessUnitId)(businessUnitId)
  );
  if (selectedBusinessUnitId === undefined) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    BUSINESS_UNIT_COOKIE_NAME,
    selectedBusinessUnitId,
    BUSINESS_UNIT_COOKIE_OPTIONS
  );
  refresh();
}
