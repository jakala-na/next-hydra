import type { ReactNode } from "react";

export type ArchitectureComposition = "app" | "cms" | "commerce" | "client";

export type ArchitectureMetadata = {
  caching?: string;
  cacheTags?: readonly string[];
  composition?: ArchitectureComposition;
  description?: string;
  getCacheTags?: () => readonly string[];
  name: string;
  streaming?: boolean;
};

type ArchitectureBoundaryProps = ArchitectureMetadata & {
  children: ReactNode;
};

const compositionLabels = {
  app: "Application",
  client: "Browser interaction",
  cms: "CMS content",
  commerce: "Commerce data",
};

export function ArchitectureBoundary({
  caching,
  cacheTags,
  children,
  composition,
  description,
  getCacheTags,
  name,
  streaming,
}: ArchitectureBoundaryProps) {
  const tags = caching ? (cacheTags ?? getCacheTags?.() ?? []) : [];
  const cacheLabel = [
    caching,
    tags.length > 0 ? `tags: ${tags.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const compositionLabel = composition
    ? compositionLabels[composition]
    : undefined;
  const title = [
    name,
    cacheLabel,
    streaming ? "Suspense region" : undefined,
    compositionLabel,
    description,
    "Authored explanation; not a live execution trace.",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className="architecture-boundary"
      data-architecture-caching={caching ? "true" : undefined}
      data-architecture-composition={composition}
      data-architecture-streaming={streaming ? "true" : undefined}
      title={title}
    >
      <div aria-hidden="true" className="architecture-boundary__label">
        <strong className="architecture-boundary__name">{name}</strong>
        {caching ? (
          <span
            className="architecture-boundary__dimension"
            data-architecture-label="caching"
          >
            {cacheLabel}
          </span>
        ) : null}
        {streaming ? (
          <span
            className="architecture-boundary__dimension"
            data-architecture-label="streaming"
          >
            Suspense region
          </span>
        ) : null}
        {compositionLabel ? (
          <span
            className="architecture-boundary__dimension"
            data-architecture-label="composition"
          >
            {compositionLabel}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
