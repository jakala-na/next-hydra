import type { NextRequest } from "next/server";
import { makeCheckoutHttpHandler } from "@/lib/checkout/http";
import { checkoutHttpDependencies } from "@/lib/checkout/runtime";

const { handler } = makeCheckoutHttpHandler(checkoutHttpDependencies);

const handleCheckoutRequest = (
  request: NextRequest,
  _context: unknown
): Promise<Response> => handler(request);

export const GET = handleCheckoutRequest;
export const POST = handleCheckoutRequest;
