import type { ReactNode } from "react";

export function Outer({ children }: { readonly children: ReactNode }) {
  return <aside>{children}</aside>;
}
