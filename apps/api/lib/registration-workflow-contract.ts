export type RegistrationWorkflowInput = {
  readonly registrationId: string;
};

export type RegistrationInvitationEvent =
  | {
      readonly event: "accepted";
      readonly acceptedIdentity: {
        readonly authUserId: string;
        readonly email: string;
        readonly firstName?: string;
        readonly lastName?: string;
      };
    }
  | {
      readonly event: "revoked";
    };
