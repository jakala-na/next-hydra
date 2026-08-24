import { authProxy } from "@repo/auth/proxy";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).*)"],
};

export default authProxy();
