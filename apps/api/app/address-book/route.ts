import type { NextRequest } from "next/server";

import { addressBookHttpHandler } from "@/lib/address-book/runtime";

export const GET = async (request: NextRequest): Promise<Response> =>
  await addressBookHttpHandler(request);
