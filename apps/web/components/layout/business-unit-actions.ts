"use server";

import { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import { Option, Schema } from "effect";
import { cookies } from "next/headers";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  BUSINESS_UNIT_COOKIE_OPTIONS,
} from "@/lib/business-unit-cookie";

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
}
