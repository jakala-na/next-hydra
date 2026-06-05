import type { NextRequest } from "next/server";
import { makeCheckoutHttpHandler } from "@/lib/checkout/http";
import { checkoutLayer } from "@/lib/checkout/runtime";

const { handler } = makeCheckoutHttpHandler({
  layer: checkoutLayer,
});

const handleCheckoutRequest = (
  request: NextRequest,
  _context: unknown
): Promise<Response> => handler(request);

export const GET = handleCheckoutRequest;
