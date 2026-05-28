export const getRegistrationApprovalHookToken = (registrationId: string) =>
  `registration-approval:${registrationId}`;

export const getRegistrationInvitationHookToken = (invitationId: string) =>
  `registration-invitation:${invitationId}`;
