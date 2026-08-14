import { applicationOpenApi } from "@/lib/openapi";

export const GET = (): Response => Response.json(applicationOpenApi);
