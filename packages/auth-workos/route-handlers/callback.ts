import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

import { keys } from "../keys";

const applicationOrigin = new URL(keys().NEXT_PUBLIC_WORKOS_REDIRECT_URI)
  .origin;

export const GET: (request: NextRequest) => Promise<Response> = handleAuth({
  baseURL: applicationOrigin,
});
