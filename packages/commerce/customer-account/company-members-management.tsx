"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { useTranslations } from "@repo/i18n";
import type { ReactNode } from "react";
import { useActionState } from "react";

import type { CompanyRole } from "../domain/commerce-account";
import type {
  CompanyMemberManagementAction,
  CompanyMemberManagementActionResult,
} from "./action-contract";

export interface CompanyInvitationRow {
  readonly companyMemberInvitationId: string;
  readonly email: string;
  readonly expiresAtLabel: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: readonly CompanyRole[];
  readonly status: "accepted" | "expired" | "pending" | "revoked";
}

export interface CompanyMemberRow {
  readonly authUserId: string;
  readonly canRemove: boolean;
  readonly customerId: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly roles: readonly CompanyRole[];
}

export interface CompanyMembersManagementProps {
  readonly cancelInvitationAction: CompanyMemberManagementAction;
  readonly currentAuthUserId: string;
  readonly invitations: readonly CompanyInvitationRow[];
  readonly members: readonly CompanyMemberRow[];
  readonly reissueInvitationAction: CompanyMemberManagementAction;
  readonly removeMemberAction: CompanyMemberManagementAction;
}

const ActionFailure = ({
  result,
}: {
  readonly result: CompanyMemberManagementActionResult | null;
}) =>
  result?._tag === "Failure" ? (
    <p aria-live="polite" className="max-w-48 text-destructive text-xs">
      {result.failure.displayMessage}
    </p>
  ) : null;

const invitationAction = (
  invitation: CompanyInvitationRow,
  cancelAction: CompanyMemberManagementAction,
  reissueAction: CompanyMemberManagementAction
) => {
  if (invitation.status === "pending") {
    return cancelAction;
  }
  if (invitation.status === "expired" || invitation.status === "revoked") {
    return reissueAction;
  }
  return undefined;
};

const InvitationActions = ({
  cancelAction,
  invitation,
  reissueAction,
}: {
  readonly cancelAction: CompanyMemberManagementAction;
  readonly invitation: CompanyInvitationRow;
  readonly reissueAction: CompanyMemberManagementAction;
}) => {
  const t = useTranslations("web.customerArea.users.management");
  const action = invitationAction(invitation, cancelAction, reissueAction);
  const [result, formAction, isPending] = useActionState(
    action ?? cancelAction,
    null
  );

  if (action === undefined) {
    return (
      <span className="text-muted-foreground text-xs">{t("noAction")}</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input
          name="companyMemberInvitationId"
          type="hidden"
          value={invitation.companyMemberInvitationId}
        />
        <Button
          disabled={isPending}
          size="sm"
          type="submit"
          variant={invitation.status === "pending" ? "outline" : "secondary"}
        >
          {invitation.status === "pending" ? t("cancel") : t("reissue")}
        </Button>
      </form>
      <ActionFailure result={result} />
    </div>
  );
};

const MemberActions = ({
  currentAuthUserId,
  member,
  removeAction,
}: {
  readonly currentAuthUserId: string;
  readonly member: CompanyMemberRow;
  readonly removeAction: CompanyMemberManagementAction;
}) => {
  const t = useTranslations("web.customerArea.users.management");
  const [result, formAction, isPending] = useActionState(removeAction, null);
  const isCurrentMember = member.authUserId === currentAuthUserId;
  let actionControl: ReactNode;

  if (isCurrentMember) {
    actionControl = (
      <span className="text-muted-foreground text-xs">{t("currentUser")}</span>
    );
  } else if (member.canRemove) {
    actionControl = (
      <form action={formAction}>
        <input name="customerId" type="hidden" value={member.customerId} />
        <Button disabled={isPending} size="sm" type="submit" variant="outline">
          {t("remove")}
        </Button>
      </form>
    );
  } else {
    actionControl = (
      <span className="text-muted-foreground text-xs">
        {t("inheritedMembership")}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {actionControl}
      <ActionFailure result={result} />
    </div>
  );
};

const RoleBadges = ({ roles }: { readonly roles: readonly CompanyRole[] }) => {
  const t = useTranslations("web.customerArea.users.invite.roles");

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} variant="outline">
          {t(`${role}.label`)}
        </Badge>
      ))}
    </div>
  );
};

const statusVariant = (status: CompanyInvitationRow["status"]) => {
  if (status === "pending" || status === "accepted") {
    return "secondary" as const;
  }
  if (status === "expired") {
    return "destructive" as const;
  }
  return "outline" as const;
};

export const CompanyMembersManagement = ({
  cancelInvitationAction,
  currentAuthUserId,
  invitations,
  members,
  reissueInvitationAction,
  removeMemberAction,
}: CompanyMembersManagementProps) => {
  const t = useTranslations("web.customerArea.users.management");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {members.length === 0 && invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("person")}</TableHead>
                <TableHead>{t("roles")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("expiry")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={`member-${member.customerId}`}>
                  <TableCell>
                    <div className="grid gap-0.5">
                      <span className="font-medium">
                        {[member.firstName, member.lastName]
                          .filter(Boolean)
                          .join(" ") || member.email}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadges roles={member.roles} />
                  </TableCell>
                  <TableCell>
                    <Badge>{t("statuses.active")}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="text-right">
                    <MemberActions
                      currentAuthUserId={currentAuthUserId}
                      member={member}
                      removeAction={removeMemberAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {invitations.map((invitation) => (
                <TableRow
                  key={`invitation-${invitation.companyMemberInvitationId}`}
                >
                  <TableCell>
                    <div className="grid gap-0.5">
                      <span className="font-medium">
                        {invitation.firstName} {invitation.lastName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {invitation.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadges roles={invitation.roles} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(invitation.status)}>
                      {t(`statuses.${invitation.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>{invitation.expiresAtLabel}</TableCell>
                  <TableCell className="text-right">
                    <InvitationActions
                      cancelAction={cancelInvitationAction}
                      invitation={invitation}
                      reissueAction={reissueInvitationAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
