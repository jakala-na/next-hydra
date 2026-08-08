import type { useRouter as useNextRouter } from "next/navigation";
import { createNavigation } from "next-intl/navigation";
import type { SupportedLocale } from "./config";
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
export const redirect: (args: {
  href: string;
  locale: SupportedLocale;
  forcePrefix?: boolean;
}) => never = _redirect;
// next-intl spreads the Next.js router at runtime, but its published return
// type predates the bfcacheId field added in Next.js 16.3.
export const useRouter = _useRouter as typeof useNextRouter;
export { getPathname, Link, usePathname };
