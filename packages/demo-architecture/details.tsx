"use client";

import { Close, Content, Portal, Root, Trigger } from "@radix-ui/react-popover";
import { Info, X } from "lucide-react";
import { useId } from "react";

import type { ArchitectureCacheLife } from "./boundary";

type ArchitectureDetailsProps = {
  cacheLife?: ArchitectureCacheLife;
  caching?: string;
  composition?: string;
  name: string;
  streaming?: boolean;
  tags: readonly string[];
};

export function ArchitectureDetails({
  cacheLife,
  caching,
  composition,
  name,
  streaming,
  tags,
}: ArchitectureDetailsProps) {
  const headingId = useId();

  return (
    <Root>
      <Trigger
        aria-label={`Inspect ${name}`}
        className="architecture-details__trigger"
      >
        <Info aria-hidden="true" size={16} />
      </Trigger>
      <Portal>
        <Content
          align="start"
          aria-labelledby={headingId}
          className="architecture-details"
          collisionPadding={12}
          sideOffset={6}
        >
          <div className="architecture-details__heading">
            <strong id={headingId}>{name}</strong>
            <Close
              aria-label="Close architecture details"
              className="architecture-details__close"
            >
              <X aria-hidden="true" size={16} />
            </Close>
          </div>
          <p
            className="architecture-details__value"
            data-architecture-label="caching"
          >
            {caching}
          </p>
          {cacheLife ? (
            <div
              className="architecture-details__value"
              data-architecture-label="caching"
            >
              <dl className="architecture-details__life">
                {(
                  [
                    ["Stale", cacheLife.stale],
                    ["Revalidate", cacheLife.revalidate],
                    ["Expire", cacheLife.expire],
                  ] as const
                ).map(([label, seconds]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {Number.isFinite(seconds) ? `${seconds}s` : "Infinity"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <p
            className="architecture-details__value"
            data-architecture-label="streaming"
          >
            {streaming ? "Suspense region" : null}
          </p>
          <p
            className="architecture-details__value"
            data-architecture-label="composition"
          >
            {composition}
          </p>
          {tags.length > 0 ? (
            <ul
              aria-label="Cache tags"
              className="architecture-details__tags"
              data-architecture-label="caching"
            >
              {tags.map((tag) => (
                <li key={tag}>
                  <code>{tag}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </Content>
      </Portal>
    </Root>
  );
}
