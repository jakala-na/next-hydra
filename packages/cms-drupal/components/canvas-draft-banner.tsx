"use client";

import { DraftSession } from "@drupal-canvas/headless-next/client";

type CanvasDraftBannerProps = {
  editorOrigin: string | null;
  initialExpired: boolean;
  renewUrl: string | null;
  tokenExpiresAt: number | null;
};

export function CanvasDraftBanner(props: CanvasDraftBannerProps) {
  return (
    <DraftSession {...props} renewEndpoint="/api/draft/renew">
      {({ embedded, expired, renewState, renewUrl }) => {
        if (embedded) {
          return null;
        }

        return (
          <aside className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-4 border-t bg-background px-4 py-3 text-sm shadow-lg">
            <span>
              {expired
                ? "Your Drupal Canvas preview session has expired."
                : "Drupal Canvas preview is active."}
              {renewState === "requested" ? " Renewing…" : null}
              {renewState === "failed" ? " Renewal failed." : null}
            </span>
            {expired && renewUrl ? (
              <a className="font-medium underline" href={renewUrl}>
                Renew session
              </a>
            ) : null}
            <form action="/api/disable-draft" method="post">
              <button className="font-medium underline" type="submit">
                Exit preview
              </button>
            </form>
          </aside>
        );
      }}
    </DraftSession>
  );
}
