import { handleAuth } from "@workos-inc/authkit-nextjs";

import { keys } from "../keys";

const applicationOrigin = new URL(keys().NEXT_PUBLIC_WORKOS_REDIRECT_URI)
  .origin;

export const GET = handleAuth({ baseURL: applicationOrigin });
