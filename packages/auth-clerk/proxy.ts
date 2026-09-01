import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextProxy } from "next/server";

export const authProxy = (next?: NextProxy): NextProxy =>
  next === undefined
    ? clerkMiddleware()
    : clerkMiddleware(
        async (_auth, request, event) => await next(request, event)
      );
