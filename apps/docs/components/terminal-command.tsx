"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, Copy } from "lucide-react";

export function TerminalCommand({ command }: { command: string }) {
  const [checked, onCopy] = useCopyButton(() =>
    navigator.clipboard.writeText(command)
  );

  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <div className="flex items-center justify-between border-fd-border border-b bg-fd-muted px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={checked ? "Copied command" : "Copy command"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-fd-border bg-fd-background/80 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        >
          {checked ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 font-mono text-sm">
        <span className="text-fd-muted-foreground">$</span>
        <span className="text-fd-foreground">{command}</span>
      </div>
    </div>
  );
}
