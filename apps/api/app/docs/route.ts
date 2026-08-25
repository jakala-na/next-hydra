import { applicationApiDocsHandler } from "@/lib/openapi-docs";

export const GET = async (request: Request): Promise<Response> =>
  await applicationApiDocsHandler(request);
