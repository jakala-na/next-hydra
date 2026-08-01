import type { NextRequest } from "next/server";
import { makeCheckoutHttpHandler } from "@/lib/checkout/http";
import { checkoutLayer } from "@/lib/checkout/runtime";

const { handler } = makeCheckoutHttpHandler({
  layer: checkoutLayer,
});

export const GET = (request: NextRequest): Promise<Response> =>
  handler(request);
