import type { NextRequest } from "next/server";

import { registrationHttpHandler } from "@/lib/registration/http-runtime";

const handleRegistrationRequest = (
  request: NextRequest,
  _context: RouteContext<"/registrations/[[...rest]]">
): Promise<Response> => registrationHttpHandler(request);

export const GET = handleRegistrationRequest;

export const POST = handleRegistrationRequest;
