import { applicationApiDocsHandler } from "@/lib/openapi-docs";

export const GET = (request: Request): Promise<Response> =>
  applicationApiDocsHandler(request);
