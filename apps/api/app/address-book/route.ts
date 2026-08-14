import type { NextRequest } from "next/server";
import { checkoutHttpHandler } from "@/lib/checkout/runtime";

export const GET = (request: NextRequest): Promise<Response> =>
  checkoutHttpHandler(request);
