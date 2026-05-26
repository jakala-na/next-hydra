"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
import { Schema } from "effect";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  canDecideRegistration,
  getRegistrationDecisionUnavailableMessage,
  registrationStatusLabels,
} from "./registration-lifecycle";
import { RegistrationStatusBadge } from "./registration-status-badge";
import {
  type ApproveRegistrationInput,
  DecisionFormSchema,
  type DecisionFormValues,
  type RegistrationDecisionResult,
  type RegistrationDetailView,
  type RejectRegistrationInput,
} from "./registration-view-models";

type RegistrationDecisionSheetProps = {
  readonly approve: (
    input: ApproveRegistrationInput
  ) => Promise<RegistrationDecisionResult>;
  readonly canDecide: boolean;
  readonly closeHref: string;
  readonly registration: RegistrationDetailView | null;
  readonly reject?: (
    input: RejectRegistrationInput
  ) => Promise<RegistrationDecisionResult>;
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

const getAddress = (registration: RegistrationDetailView) =>
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
  approve,
  closeHref,
  registration,
  canDecide,
  reject,
}: RegistrationDecisionSheetProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(Boolean(registration));
  const registrationId = registration?.registrationId;
  const form = useForm<DecisionFormValues>({
    resolver: standardSchemaResolver(
      Schema.toStandardSchemaV1(DecisionFormSchema)
    ),
    defaultValues: {
      reason: registration?.approvalReason ?? "",
    },
  });

  useEffect(() => {
    setIsOpen(Boolean(registrationId));
  }, [registrationId]);

  if (!registration) {
    return null;
  }

  const canSubmitDecision =
    canDecide && canDecideRegistration(registration.status);
  const decisionUnavailableMessage = getRegistrationDecisionUnavailableMessage(
    registration.status
  );

  const handleSubmitDecision =
    (decision: "approved" | "rejected"): SubmitHandler<DecisionFormValues> =>
    async (values) => {
      setSubmitError(null);
      setIsSubmitting(true);

      try {
        const action = decision === "approved" ? approve : reject;

        if (!action) {
          setSubmitError("This decision is not available.");
          return;
        }

        const result = await action({
          registrationId: registration.registrationId,
          ...(values.reason ? { reason: values.reason } : {}),
        });

        switch (result._tag) {
          case "Success":
            setSubmitError(null);
            setIsOpen(false);
            toast.success(
              `Registration ${registrationStatusLabels[
                result.status
              ].toLowerCase()}.`
            );
            router.replace(closeHref as Route);
            router.refresh();
            return;
          case "Conflict":
          case "NotFound":
          case "Failure":
            setSubmitError(result.message);
            return;
          default:
            result satisfies never;
        }
      } catch {
        setSubmitError("The decision could not be saved. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
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
        setIsOpen(open);
        if (!open) {
          router.replace(closeHref as Route);
        }
      }}
      open={isOpen}
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
              {registration.invitationId ? (
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                    Invitation
                  </dt>
                  <dd className="mt-1 break-all text-sm">
                    {registration.invitationId}
                  </dd>
                </div>
              ) : null}
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
