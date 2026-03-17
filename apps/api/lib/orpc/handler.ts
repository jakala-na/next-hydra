import { RPCHandler } from "@orpc/server/fetch";
import type { RegistrationProcedureContext } from "@repo/registration/orpc/types";
import { router } from "./router";

const rpcHandler = new RPCHandler<RegistrationProcedureContext>(router);

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
