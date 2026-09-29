import type { ReactNode } from "react";

import { ArchitectureDetails } from "./details";

export type ArchitectureComposition = "app" | "cms" | "commerce" | "client";

export type ArchitectureCacheLife = {
  stale: number;
  revalidate: number;
  expire: number;
};

export type ArchitectureMetadata = {
  caching?: string;
  cacheTags?: readonly string[];
  composition?: ArchitectureComposition;
  description?: string;
  getCaching?: () => string;
  getCacheLife?: () => ArchitectureCacheLife | undefined;
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
  caching: suppliedCaching,
  cacheTags,
  children,
  composition,
  getCaching,
  getCacheLife,
  getCacheTags,
  name,
  streaming,
}: ArchitectureBoundaryProps) {
  const caching = suppliedCaching ?? getCaching?.();
  const tags = caching ? (cacheTags ?? getCacheTags?.() ?? []) : [];
  const compositionLabel = composition
    ? compositionLabels[composition]
    : undefined;

  return (
    <div
      className="architecture-boundary"
      data-architecture-caching={caching ? "true" : undefined}
      data-architecture-composition={composition}
      data-architecture-streaming={streaming ? "true" : undefined}
    >
      <div className="architecture-boundary__label">
        <ArchitectureDetails
          cacheLife={getCacheLife?.()}
          caching={caching}
          composition={compositionLabel}
          name={name}
          streaming={streaming}
          tags={tags}
        />
        <strong className="architecture-boundary__name">{name}</strong>
        {caching ? (
          <span
            className="architecture-boundary__dimension"
            data-architecture-label="caching"
          >
            {caching}
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
