import type { NextRequest } from "next/server";
import { addressBookHttpHandler } from "@/lib/address-book/runtime";

export const GET = (request: NextRequest): Promise<Response> =>
  addressBookHttpHandler(request);
