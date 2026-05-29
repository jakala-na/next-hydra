import type { useRouter as useNextRouter } from "next/navigation";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Lightweight wrappers around Next.js' navigation
// APIs that consider the routing configuration
const {
  Link,
  redirect: _redirect,
  usePathname,
  useRouter: _useRouter,
  getPathname,
} = createNavigation(routing);

// Re-export redirect with type annotation to help TypeScript detect unreachable code
// See: https://github.com/amannn/next-intl/issues/823
export const redirect: typeof _redirect = _redirect;
export const useRouter: typeof useNextRouter = _useRouter;
export { Link, usePathname, getPathname };
