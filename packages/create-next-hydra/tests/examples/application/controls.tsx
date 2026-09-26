import Link from "next/link";
import type { ReactNode } from "react";

export function Frame({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}

export function Account() {
  return <Link href="/account">Account</Link>;
}
