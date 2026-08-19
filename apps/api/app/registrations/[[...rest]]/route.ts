import type { NextRequest } from "next/server";

import { registrationHttpHandler } from "@/lib/registration/http-runtime";

const handleRegistrationRequest = async (
  request: NextRequest,
  _context: RouteContext<"/registrations/[[...rest]]">
): Promise<Response> => await registrationHttpHandler(request);

export const GET = handleRegistrationRequest;

export const POST = handleRegistrationRequest;
