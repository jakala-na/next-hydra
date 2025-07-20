import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from 'next-safe-action';
import { z } from 'zod';

export class ActionError extends Error {}

export const action = createSafeActionClient({
  // You can provide a custom handler for server errors, otherwise the lib will use `console.error`
  // as the default logging mechanism and will return the DEFAULT_SERVER_ERROR_MESSAGE for all server errors.
  handleServerError: (e) => {
    console.error('Action server error occurred:', e.message);

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
}).use(async ({ next, metadata, clientInput, bindArgsClientInputs, ctx }) => {
  // Here we use a logging middleware.
  const start = Date.now();

  // Here we await the next middleware.
  const result = await next();

  const end = Date.now();

  const durationInMs = end - start;

  const logObject: Record<string, any> = { durationInMs };

  logObject.clientInput = clientInput;
  logObject.bindArgsClientInputs = bindArgsClientInputs;
  logObject.metadata = metadata;
  logObject.result = result;

  console.log('LOGGING FROM MIDDLEWARE:');
  console.dir(logObject, { depth: null });

  // And then return the result of the awaited next middleware.
  return result;
});
