import type { ReactNode } from "react";
import { architectureOverlaysEnabled } from "./architecture-config";

export type ArchitectureComponent = "client" | "server";
export type ArchitectureLayer =
  | "block"
  | "interactive"
  | "orchestration"
  | "presentation"
  | "route"
  | "shell";
export type ArchitectureRendering =
  | "cached"
  | "dynamic"
  | "static"
  | "streamed";
export type ArchitectureSource = "app" | "cms" | "commerce" | "design-system";

export type ArchitectureMetadata = {
  cacheProfile?: string;
  cacheTags?: readonly string[];
  component: ArchitectureComponent;
  description?: string;
  layer: ArchitectureLayer;
  layerLabel: string;
  name: string;
  rendering: ArchitectureRendering;
  source: ArchitectureSource;
  sourceLabel: string;
};

type ArchitectureBoundaryProps = ArchitectureMetadata & {
  children: ReactNode;
  className?: string;
};

function renderingLabel({
  cacheProfile,
  cacheTags = [],
  rendering,
}: Pick<
  ArchitectureBoundaryProps,
  "cacheProfile" | "cacheTags" | "rendering"
>) {
  const parts: string[] = [rendering];

  if (cacheProfile) {
    parts.push(cacheProfile);
  }
  if (cacheTags.length > 0) {
    parts.push(`tags: ${cacheTags.join(", ")}`);
  }

  return parts.join(" · ");
}

export function ArchitectureBoundary({
  cacheProfile,
  cacheTags,
  children,
  className,
  component,
  description,
  layer,
  layerLabel,
  name,
  rendering,
  source,
  sourceLabel,
}: ArchitectureBoundaryProps) {
  if (!architectureOverlaysEnabled) {
    return children;
  }

  const renderLabel = renderingLabel({
    cacheProfile,
    cacheTags,
    rendering,
  });
  const title = [
    name,
    `${component} component`,
    renderLabel,
    sourceLabel,
    layerLabel,
    description,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className={
        className
          ? `architecture-boundary ${className}`
          : "architecture-boundary"
      }
      data-architecture-component={component}
      data-architecture-layer={layer}
      data-architecture-rendering={rendering}
      data-architecture-source={source}
      title={title}
    >
      <div aria-hidden="true" className="architecture-boundary__label">
        <strong className="architecture-boundary__name">{name}</strong>
        <span
          className="architecture-boundary__dimension"
          data-architecture-label="rendering"
        >
          {renderLabel}
        </span>
        <span
          className="architecture-boundary__dimension"
          data-architecture-label="components"
        >
          {component} component
        </span>
        <span
          className="architecture-boundary__dimension"
          data-architecture-label="sources"
        >
          {sourceLabel}
        </span>
        <span
          className="architecture-boundary__dimension"
          data-architecture-label="layers"
        >
          {layerLabel}
        </span>
      </div>
      {children}
    </div>
  );
}
