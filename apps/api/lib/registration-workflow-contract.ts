export type RegistrationWorkflowInput = {
  readonly registrationId: string;
};

export type RegistrationWorkflowDecision = {
  readonly decision: "approved" | "rejected";
  readonly reviewer: {
    readonly authUserId: string;
    readonly email: string;
    readonly name: string;
  };
  readonly reason?: string;
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
