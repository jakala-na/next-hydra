import { storeService } from "@repo/commerce/lib/store/store.service";
import { getLocale } from "@repo/i18n";
import { log } from "@repo/observability/log";
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { z } from "zod";

export class ActionError extends Error {}

export const action = createSafeActionClient({
  // You can provide a custom handler for server errors, otherwise the lib will use `console.error`
  // as the default logging mechanism and will return the DEFAULT_SERVER_ERROR_MESSAGE for all server errors.
  handleServerError: (e) => {
    log.error(`Action server error occurred: ${e.message}`, { details: e });

    // If the error is an instance of `ActionError`, unmask the message.
    if (e instanceof ActionError) {
      return e.message;
    }

    // Otherwise return default error message.
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
  // Here we define a metadata type to be used in `metadata` instance method.
  defineMetadataSchema() {
    return z.object({
      actionName: z.string(),
    });
  },
});

export const inStoreAction = action.use(async ({ next }) => {
  const locale = await getLocale();
  const storeCtx = await storeService.getStoreContextByLocale(locale);
  if (!storeCtx) {
    // Unsafe error.
    throw new Error(`Store not found for locale: ${locale}`);
  }

  return next({
    ctx: storeCtx,
  });
});
