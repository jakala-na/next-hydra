import type { NextRequest } from "next/server";
import { checkoutHttpHandler } from "@/lib/checkout/runtime";

const handleCheckoutRequest = (
  request: NextRequest,
  _context: unknown
): Promise<Response> => checkoutHttpHandler(request);

export const GET = handleCheckoutRequest;
export const POST = handleCheckoutRequest;
