import {
  createComponentMetadataHandler,
  createDraftRouteHandlers,
  getDraftData,
  nextDraftAdapter,
} from "@drupal-canvas/headless-next";
import { createDraftServer } from "@drupal-canvas/headless/server";

import { toCanvasPreviewPath } from "../lib/locale";

const draftRoutes = createDraftRouteHandlers();
const componentMetadata = createComponentMetadataHandler({
  scanComponents:
    process.env.NODE_ENV === "development"
      ? async () => {
          const { buildComponentMetadataPayload } =
            await import("@drupal-canvas/headless/components-endpoint");

          return await buildComponentMetadataPayload({
            projectRoot: process.env.CANVAS_PROJECT_ROOT ?? process.cwd(),
          });
        }
      : undefined,
});

export async function enableCanvasDraft(request: Request): Promise<Response> {
  // Let upstream redeem and validate the assertion before interpreting language.
  const server = createDraftServer({
    adapter: {
      ...nextDraftAdapter,
      redirect: (path) =>
        new Response(null, { headers: { Location: path }, status: 307 }),
    },
  });
  const response = await server.enableDraftMode(request);
  const location = response.headers.get("location");
  if (response.status === 307 && location) {
    const draft = await getDraftData();
    response.headers.set(
      "location",
      toCanvasPreviewPath(location, draft?.previewContext?.language)
    );
  }
  return response;
}
export const renewCanvasDraft = draftRoutes.draftRenew.POST;
export const disableCanvasDraft = draftRoutes.disableDraft.POST;
export const getCanvasComponents = componentMetadata.GET;
export const optionsCanvasComponents = componentMetadata.OPTIONS;
