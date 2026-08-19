import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    links: [
      { text: "Docs", url: "/docs" },
      { external: true, text: "Demo", url: "https://demo.next-hydra.dev" },
    ],
    nav: {
      title: "next-hydra",
      transparentMode: "top",
    },
  };
}
