import type { NextRequest } from "next/server";
import { makeCheckoutHttpHandler } from "@/lib/checkout/http";
import { checkoutHttpDependencies } from "@/lib/checkout/runtime";

const { handler } = makeCheckoutHttpHandler(checkoutHttpDependencies);

export const GET = (request: NextRequest): Promise<Response> =>
  handler(request);
