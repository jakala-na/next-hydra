"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isDefinedError, onError, onSuccess } from "@orpc/client";
import { useServerAction } from "@orpc/react/hooks";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/design-system/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import type { RegistrationDetail } from "@repo/registration/domain/types";
import { REGISTRATION_FIELD_LIMITS } from "@repo/registration/domain/types";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { decideRegistration } from "@/lib/admin-registration-actionables";
import {
  canDecideRegistration,
  getRegistrationDecisionConflictMessage,
  getRegistrationDecisionUnavailableMessage,
} from "./registration-lifecycle";
import { RegistrationStatusBadge } from "./registration-status-badge";

const decisionFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(
      REGISTRATION_FIELD_LIMITS.approvalReason,
      `Keep the reason under ${REGISTRATION_FIELD_LIMITS.approvalReason} characters.`
    ),
});

type DecisionFormValues = z.infer<typeof decisionFormSchema>;

type RegistrationDecisionSheetProps = {
  closeHref: string;
  registration: RegistrationDetail | null;
  canDecide: boolean;
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const getAddress = (registration: RegistrationDetail) =>
  [
    registration.address.streetName,
    registration.address.additionalStreetInfo,
    [registration.address.postalCode, registration.address.city]
      .filter(Boolean)
      .join(" "),
    registration.address.region,
    registration.address.country,
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");

export function RegistrationDecisionSheet({
  closeHref,
  registration,
  canDecide,
}: RegistrationDecisionSheetProps) {
  const router = useRouter();
  const [activeDecision, setActiveDecision] = useState<
    "approved" | "rejected" | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionFormSchema),
    defaultValues: {
      reason: registration?.approvalReason ?? "",
    },
  });
  const { execute, status } = useServerAction(decideRegistration, {
    interceptors: [
      onSuccess((result) => {
        const outcome = activeDecision === "rejected" ? "rejected" : "approved";

        setSubmitError(null);
        setActiveDecision(null);
        toast.success(`Registration ${outcome}.`, {
          description:
            result.status === "approval_processing"
              ? "The decision is processing and the dashboard will refresh."
              : undefined,
        });
        router.replace(closeHref as Route);
        router.refresh();
      }),
      onError((error) => {
        setActiveDecision(null);

        const definedError = isDefinedError(error) ? error : null;

        if (definedError) {
          switch (definedError.code) {
            case "REGISTRATION_CONFLICT":
              setSubmitError(
                getRegistrationDecisionConflictMessage(definedError.data.reason)
              );
              return;
            case "REGISTRATION_NOT_FOUND":
              setSubmitError("This registration could not be found anymore.");
              return;
            default:
              break;
          }
        }

        setSubmitError("The decision could not be saved. Please try again.");
      }),
    ],
  });

  if (!registration) {
    return null;
  }

  const canSubmitDecision =
    canDecide && canDecideRegistration(registration.status);
  const isSubmitting = status === "pending";
  const decisionUnavailableMessage = getRegistrationDecisionUnavailableMessage(
    registration.status
  );

  const handleSubmitDecision =
    (decision: "approved" | "rejected"): SubmitHandler<DecisionFormValues> =>
    (values) => {
      setActiveDecision(decision);
      setSubmitError(null);
      execute({
        registrationId: registration.registrationId,
        decision,
        reason: values.reason,
      });
    };

  const submitDecision = (decision: "approved" | "rejected") =>
    form.handleSubmit(handleSubmitDecision(decision))();

  const reviewer =
    registration.actorName || registration.actorEmail || "Unknown reviewer";
  let reviewerAction = "";

  if (registration.approvedAt) {
    reviewerAction = ` approved this on ${formatDateTime(registration.approvedAt)}`;
  } else if (registration.rejectedAt) {
    reviewerAction = ` rejected this on ${formatDateTime(registration.rejectedAt)}`;
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          router.replace(closeHref as Route);
        }
      }}
      open
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <RegistrationStatusBadge status={registration.status} />
            <p className="text-muted-foreground text-sm">
              Submitted {formatDateTime(registration.createdAt)}
            </p>
          </div>
          <SheetTitle className="text-2xl">
            {registration.companyName}
          </SheetTitle>
          <SheetDescription>
            Review the registration details and record an approval decision.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 px-6 py-6">
          <section className="grid gap-4 rounded-2xl border bg-muted/20 p-5">
            <div className="grid gap-1">
              <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-[0.18em]">
                Registration Summary
              </h2>
              <p className="text-muted-foreground text-sm">
                Registration ID {registration.registrationId}
              </p>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Contact
                </dt>
                <dd className="mt-1 text-sm">
                  {registration.contactFirstName} {registration.contactLastName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Email
                </dt>
                <dd className="mt-1 break-all text-sm">{registration.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Phone
                </dt>
                <dd className="mt-1 text-sm">
                  {registration.companyPhone || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  VAT ID
                </dt>
                <dd className="mt-1 text-sm">{registration.vatId || "-"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Address
                </dt>
                <dd className="mt-1 text-sm">{getAddress(registration)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Last Updated
                </dt>
                <dd className="mt-1 text-sm">
                  {formatDateTime(registration.updatedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Invitation State
                </dt>
                <dd className="mt-1 text-sm">
                  {registration.invitationState || "-"}
                </dd>
              </div>
            </dl>
          </section>

          {(registration.approvalReason ||
            registration.actorName ||
            registration.actorEmail) && (
            <section className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-[0.18em]">
                Current Decision Notes
              </h2>
              <p className="text-sm text-stone-700">
                {registration.approvalReason ||
                  "No decision note was recorded."}
              </p>
              <p className="text-muted-foreground text-sm">
                {reviewer}
                {reviewerAction}
              </p>
            </section>
          )}

          <section className="grid gap-4 rounded-2xl border p-5">
            <div className="grid gap-1">
              <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-[0.18em]">
                Approval Decision
              </h2>
              <p className="text-muted-foreground text-sm">
                {canDecide
                  ? "Add the reason that should be stored with this approval decision."
                  : "You can review registrations, but you do not have permission to approve or reject them."}
              </p>
            </div>

            <Form {...form}>
              <form
                className="grid gap-4"
                onSubmit={(event) => event.preventDefault()}
              >
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          disabled={!canSubmitDecision || isSubmitting}
                          placeholder="Summarize why this registration should be approved or rejected."
                          rows={6}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {submitError ? (
                  <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-destructive text-sm">
                    {submitError}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    disabled={!canSubmitDecision || isSubmitting}
                    onClick={() => submitDecision("rejected")}
                    type="button"
                    variant="outline"
                  >
                    {isSubmitting ? "Saving..." : "Reject registration"}
                  </Button>
                  <Button
                    disabled={!canSubmitDecision || isSubmitting}
                    onClick={() => submitDecision("approved")}
                    type="button"
                  >
                    {isSubmitting ? "Saving..." : "Approve registration"}
                  </Button>
                </div>

                {decisionUnavailableMessage ? (
                  <p className="text-muted-foreground text-sm">
                    {decisionUnavailableMessage}
                  </p>
                ) : null}
              </form>
            </Form>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
