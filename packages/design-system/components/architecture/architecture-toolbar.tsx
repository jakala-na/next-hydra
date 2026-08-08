"use client";

import { Boxes, DatabaseZap, EyeOff, Layers3, Server } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { architectureOverlaysEnabled } from "./architecture-config";

const STORAGE_KEY = "next-hydra-architecture-overlay";

const modes = [
  { icon: EyeOff, label: "Off", value: "off" },
  { icon: DatabaseZap, label: "Rendering", value: "rendering" },
  { icon: Server, label: "Components", value: "components" },
  { icon: Boxes, label: "Sources", value: "sources" },
  { icon: Layers3, label: "Layers", value: "layers" },
] as const;

export type ArchitectureOverlayMode = (typeof modes)[number]["value"];

function isArchitectureOverlayMode(
  value: string | null
): value is ArchitectureOverlayMode {
  return modes.some((mode) => mode.value === value);
}

function applyMode(mode: ArchitectureOverlayMode) {
  document.documentElement.dataset.architectureOverlayMode = mode;
}

function EnabledArchitectureToolbar() {
  const [mode, setMode] = useState<ArchitectureOverlayMode>("off");

  useEffect(() => {
    const storedMode = localStorage.getItem(STORAGE_KEY);
    const initialMode = isArchitectureOverlayMode(storedMode)
      ? storedMode
      : "off";
    setMode(initialMode);
    applyMode(initialMode);
  }, []);

  const selectMode = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const nextMode = event.currentTarget.value;
    if (!isArchitectureOverlayMode(nextMode)) {
      return;
    }

    setMode(nextMode);
    localStorage.setItem(STORAGE_KEY, nextMode);
    applyMode(nextMode);
  }, []);

  return (
    <aside
      aria-label="Architecture overlay controls"
      className="fixed right-4 bottom-4 z-[100] rounded-xl border bg-background/95 p-1.5 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-1">
        <span className="hidden px-2 font-mono text-muted-foreground text-xs lg:inline">
          Architecture
        </span>
        {modes.map(({ icon: Icon, label, value }) => (
          <button
            aria-pressed={mode === value}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 font-medium text-xs transition-colors hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            key={value}
            onClick={selectMode}
            title={`Show ${label.toLowerCase()} metadata`}
            type="button"
            value={value}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function ArchitectureToolbar() {
  return architectureOverlaysEnabled ? <EnabledArchitectureToolbar /> : null;
}
