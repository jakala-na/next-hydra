"use client";

import { Boxes, DatabaseZap, EyeOff, Layers3, Server } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { MouseEvent } from "react";

const STORAGE_KEY = "next-hydra-architecture-overlay";
const CHANGE_EVENT = "architecture-overlay-change";

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

function readMode(): ArchitectureOverlayMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isArchitectureOverlayMode(stored) ? stored : "off";
}

function serverMode(): ArchitectureOverlayMode {
  return "off";
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function ArchitectureToolbar() {
  const mode = useSyncExternalStore(subscribe, readMode, serverMode);
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  const selectMode = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const nextMode = event.currentTarget.value;
    if (!isArchitectureOverlayMode(nextMode)) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, nextMode);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return (
    <aside
      aria-label="Architecture overlay controls"
      className="architecture-toolbar"
    >
      <div className="architecture-toolbar__controls">
        <span className="architecture-toolbar__heading">Architecture</span>
        {modes.map(({ icon: Icon, label, value }) => (
          <button
            aria-pressed={mode === value}
            className="architecture-toolbar__button"
            key={value}
            onClick={selectMode}
            title={`Show ${label.toLowerCase()} metadata`}
            type="button"
            value={value}
          >
            <Icon aria-hidden="true" className="architecture-toolbar__icon" />
            <span className="architecture-toolbar__mode-label">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
