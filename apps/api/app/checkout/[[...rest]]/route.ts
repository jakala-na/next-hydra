import type { NextRequest } from "next/server";

import { checkoutHttpHandler } from "@/lib/checkout/runtime";

const handleCheckoutRequest = async (
  request: NextRequest,
  _context: unknown
): Promise<Response> => await checkoutHttpHandler(request);

export const GET = handleCheckoutRequest;
export const POST = handleCheckoutRequest;
