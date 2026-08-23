import { AuthSession, AuthUser } from "@repo/auth-contract/session";
import type { AuthPermissionAdapter } from "@repo/auth-contract/session";
import type { NoUserInfo, UserInfo } from "@workos-inc/authkit-nextjs";
import { Schema } from "effect";

export { AuthSessionReadFailure } from "@repo/auth-contract/session";

interface WorkosAuthSessionFields {
  accessToken?: string;
  permissions: AuthPermissionAdapter;
  sessionId?: string;
  user: AuthUser | null;
}

export const workosSessionToAuthSession = (
  session: NoUserInfo | UserInfo
): AuthSession => {
  const authSession: WorkosAuthSessionFields = {
    permissions: {
      has: (permission) => session.permissions?.includes(permission) ?? false,
    },
    user: session.user
      ? Schema.decodeSync(AuthUser)({
          email: session.user.email,
          firstName: session.user.firstName,
          id: session.user.id,
          lastName: session.user.lastName,
          profilePictureUrl: session.user.profilePictureUrl,
        })
      : null,
  };

  if (session.accessToken !== undefined) {
    authSession.accessToken = session.accessToken;
  }
  if (session.sessionId !== undefined) {
    authSession.sessionId = session.sessionId;
  }

  return Schema.decodeSync(AuthSession)(authSession);
};
