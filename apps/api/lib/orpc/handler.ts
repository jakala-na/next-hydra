import { RPCHandler } from "@orpc/server/fetch";
import { ORPCError } from "@orpc/server";
import type { RegistrationProcedureContext } from "@repo/registration/orpc/types";
import { router } from "./router";

const rpcHandler = new RPCHandler<RegistrationProcedureContext>(router, {
  interceptors: [
    async (options) => {
      try {
        return await options.next();
      } catch (error) {
        if (error instanceof ORPCError && error.defined) {
          throw error;
        }

        console.error("Unhandled registration RPC error", {
          path: options.request.url.pathname,
          cause: error,
        });

        throw error;
      }
    },
  ],
});

export async function handleRpcRequest(request: Request) {
  const { response } = await rpcHandler.handle(request, {
    prefix: "/rpc",
    context: {
      approvalSecret:
        request.headers.get("x-registration-approval-secret") ?? undefined,
    },
  });

  return response ?? new Response("Not found", { status: 404 });
}
