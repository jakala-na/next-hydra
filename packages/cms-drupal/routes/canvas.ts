import {
  createComponentMetadataHandler,
  createDraftRouteHandlers,
} from "@drupal-canvas/headless-next";

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

export const enableCanvasDraft = draftRoutes.draft.GET;
export const renewCanvasDraft = draftRoutes.draftRenew.POST;
export const disableCanvasDraft = draftRoutes.disableDraft.POST;
export const getCanvasComponents = componentMetadata.GET;
export const optionsCanvasComponents = componentMetadata.OPTIONS;
