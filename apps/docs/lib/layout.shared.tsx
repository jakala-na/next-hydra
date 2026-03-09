import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "next-hydra",
      transparentMode: "top",
    },
    links: [
      { text: "Docs", url: "/docs" },
      { text: "Demo", url: "https://demo.next-hydra.dev", external: true },
    ],
  };
}
