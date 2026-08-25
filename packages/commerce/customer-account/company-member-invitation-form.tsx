"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "@repo/i18n";
import { useActionState } from "react";

import { COMPANY_ROLES } from "../domain/commerce-account";
import type { InviteCompanyMemberAction } from "./action-contract";

export interface CompanyMemberInvitationFormProps {
  readonly canInvite: boolean;
  readonly inviteAction: InviteCompanyMemberAction;
}

export const CompanyMemberInvitationForm = ({
  canInvite,
  inviteAction,
}: CompanyMemberInvitationFormProps) => {
  const t = useTranslations("web.customerArea");
  const [result, formAction, isPending] = useActionState(inviteAction, null);
  const failure = result?._tag === "Failure" ? result.failure : undefined;
  const emailInvalid =
    failure?.error._tag === "InputInvalid" &&
    failure.error.issues.some((issue) => issue.path[0] === "email");
  const rolesInvalid =
    failure?.error._tag === "InputInvalid" &&
    failure.error.issues.some((issue) => issue.path[0] === "roles");

  if (!canInvite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("users.adminOnly.title")}</CardTitle>
          <CardDescription>{t("users.adminOnly.description")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.invite.title")}</CardTitle>
        <CardDescription>{t("users.invite.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5">
          {failure === undefined ? null : (
            <Alert aria-live="polite" variant="destructive">
              <AlertTitle>{t("users.invite.failureTitle")}</AlertTitle>
              <AlertDescription>{failure.displayMessage}</AlertDescription>
            </Alert>
          )}
          {result?._tag === "Success" ? (
            <Alert aria-live="polite">
              <AlertTitle>{t("users.invite.successTitle")}</AlertTitle>
              <AlertDescription>
                {t("users.invite.successDescription", {
                  email: result.success.inviteeEmail,
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="company-member-email">
              {t("users.invite.emailLabel")}
            </Label>
            <Input
              aria-invalid={emailInvalid || undefined}
              autoComplete="email"
              id="company-member-email"
              name="email"
              placeholder={t("users.invite.emailPlaceholder")}
              required
              type="email"
            />
          </div>
          <fieldset
            aria-describedby="company-member-roles-description"
            aria-invalid={rolesInvalid || undefined}
            className="grid gap-3"
          >
            <legend className="font-medium text-sm">
              {t("users.invite.rolesLabel")}
            </legend>
            <p
              className="text-muted-foreground text-sm"
              id="company-member-roles-description"
            >
              {t("users.invite.rolesDescription")}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {COMPANY_ROLES.map((role) => {
                const id = `company-member-role-${role}`;

                return (
                  <Label
                    className="flex items-start gap-3 rounded-md border p-3"
                    htmlFor={id}
                    key={role}
                  >
                    <Checkbox
                      defaultChecked={role === "buyer"}
                      id={id}
                      name={`roles[${role}]`}
                      value={role}
                    />
                    <span className="grid gap-1">
                      <span>{t(`users.invite.roles.${role}.label`)}</span>
                      <span className="font-normal text-muted-foreground text-xs">
                        {t(`users.invite.roles.${role}.description`)}
                      </span>
                    </span>
                  </Label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <Button disabled={isPending} type="submit">
              {isPending ? t("users.invite.sending") : t("users.invite.send")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
