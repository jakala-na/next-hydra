import {
  getDraftData,
  getDraftEditorOrigin,
  isDraftSessionExpired,
} from "@drupal-canvas/headless-next";
import { CanvasDraftBanner } from "./canvas-draft-banner";

export async function LivePreview({ isEnabled }: { isEnabled: boolean }) {
  if (!isEnabled) {
    return null;
  }

  const draftData = await getDraftData();
  if (!draftData) {
    // Existing GraphQL and Next.js-for-Drupal previews also use Draft Mode.
    return null;
  }

  return (
    <CanvasDraftBanner
      editorOrigin={getDraftEditorOrigin(draftData)}
      initialExpired={isDraftSessionExpired(draftData)}
      renewUrl={draftData.renewUrl}
      tokenExpiresAt={draftData.tokenExpiresAt}
    />
  );
}
