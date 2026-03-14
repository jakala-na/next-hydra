import "server-only";

import { keys } from "./keys";

type CreateWorkosInvitationInput = {
  email: string;
};

type WorkosInvitationResponse = {
  id: string;
  email: string;
  state?: "pending" | "accepted" | "revoked";
  acceptInvitationUrl?: string;
  accept_invitation_url?: string;
};

type WorkosUserResponse = {
  id: string;
  email: string;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
};

export type WorkosInvitation = {
  id: string;
  email: string;
  state?: "pending" | "accepted" | "revoked";
  acceptInvitationUrl: string;
};

export type WorkosUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

type WorkosErrorBody = {
  message?: string;
  code?: string;
  errors?: Array<{
    code?: string;
    message?: string;
  }>;
};

export class WorkosAdminError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: WorkosErrorBody["errors"];

  constructor(status: number, body: WorkosErrorBody | null) {
    super(body?.message ?? "WorkOS request failed.");
    this.name = "WorkosAdminError";
    this.status = status;
    this.code = body?.code;
    this.details = body?.errors;
  }

  hasDetail(code: string) {
    return this.details?.some((detail) => detail.code === code) ?? false;
  }
}

const createError = async (response: Response) => {
  const body: WorkosErrorBody | null = await response.json().catch(() => null);
  return new WorkosAdminError(response.status, body);
};

export async function createWorkosInvitation(
  input: CreateWorkosInvitationInput
): Promise<WorkosInvitation> {
  const response = await fetch(
    "https://api.workos.com/user_management/invitations",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${keys().WORKOS_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
      }),
    }
  );

  if (!response.ok) {
    throw await createError(response);
  }

  const invitation: WorkosInvitationResponse = await response.json();
  const acceptInvitationUrl =
    invitation.acceptInvitationUrl ?? invitation.accept_invitation_url;

  if (!acceptInvitationUrl) {
    throw new Error(
      "WorkOS invitation response did not include an accept URL."
    );
  }

  return {
    id: invitation.id,
    email: invitation.email,
    state: invitation.state,
    acceptInvitationUrl,
  };
}

export async function getWorkosUser(userId: string): Promise<WorkosUser> {
  const response = await fetch(
    `https://api.workos.com/user_management/users/${userId}`,
    {
      headers: {
        authorization: `Bearer ${keys().WORKOS_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw await createError(response);
  }

  const user: WorkosUserResponse = await response.json();

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? user.first_name ?? undefined,
    lastName: user.lastName ?? user.last_name ?? undefined,
  };
}

export async function revokeWorkosInvitation(
  invitationId: string
): Promise<void> {
  const response = await fetch(
    `https://api.workos.com/user_management/invitations/${invitationId}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${keys().WORKOS_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw await createError(response);
  }
}
