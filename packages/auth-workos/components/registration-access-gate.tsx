import {
  getLatestRegistrationRecordByAuthEmail,
  getRegistrationRecordByWorkosUserId,
} from "@repo/commerce/lib/b2b-registration/service";
import { getTranslations } from "@repo/i18n";
import type { ReactNode } from "react";

type RegistrationAccessGateProps = {
  readonly children: ReactNode;
  readonly workosUserEmail?: string;
  readonly workosUserId?: string;
};

const accessGateActions = [
  { href: "/api/auth/signout", key: "actions.signOut" },
  { href: "/", key: "actions.backToHome" },
] as const;

function AccessGateShell({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 py-16">
      <div className="max-w-xl rounded-[2rem] border border-stone-300 bg-white p-10 shadow-sm">
        {children}
      </div>
    </main>
  );
}

function getGateContent(
  status: "pending" | "rejected" | "workflow_start_failed",
  approvalReason: string | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>
) {
  if (status === "rejected") {
    return {
      eyebrow: t("rejected.eyebrow"),
      title: t("rejected.title"),
      description: approvalReason ?? t("rejected.description"),
    };
  }

  if (status === "workflow_start_failed") {
    return {
      eyebrow: t("failed.eyebrow"),
      title: t("failed.title"),
      description: t("failed.description"),
    };
  }

  return {
    eyebrow: t("pending.eyebrow"),
    title: t("pending.title"),
    description: t("pending.description"),
  };
}

export async function RegistrationAccessGate({
  children,
  workosUserEmail,
  workosUserId,
}: RegistrationAccessGateProps) {
  const t = await getTranslations("web.registration.gate");

  if (!(workosUserId || workosUserEmail)) {
    return children;
  }

  const recordByUserId = workosUserId
    ? await getRegistrationRecordByWorkosUserId(workosUserId)
    : null;

  if (recordByUserId?.status === "approved") {
    return children;
  }

  const recordByAuthEmail = workosUserEmail
    ? await getLatestRegistrationRecordByAuthEmail(workosUserEmail)
    : null;

  if (recordByAuthEmail?.status === "approved") {
    return children;
  }

  const record = recordByUserId ?? recordByAuthEmail;

  if (!record) {
    return (
      <AccessGateShell>
        <p className="text-sm text-stone-500 uppercase tracking-[0.24em]">
          {t("accessUnavailable.eyebrow")}
        </p>
        <h1 className="mt-4 font-semibold text-4xl text-stone-950">
          {t("accessUnavailable.title")}
        </h1>
        <p className="mt-6 text-base text-stone-600 leading-7">
          {t("accessUnavailable.description")}
        </p>
        <div className="mt-8 flex gap-4">
          {accessGateActions.map((action) => (
            <a
              key={action.href}
              className="text-sm text-stone-900 underline"
              href={action.href}
            >
              {t(action.key)}
            </a>
          ))}
        </div>
      </AccessGateShell>
    );
  }

  if (record.status === "approved") {
    return children;
  }

  const gateContent = getGateContent(record.status, record.approvalReason, t);

  return (
    <AccessGateShell>
      <p className="text-sm text-stone-500 uppercase tracking-[0.24em]">
        {gateContent.eyebrow}
      </p>
      <h1 className="mt-4 font-semibold text-4xl text-stone-950">
        {gateContent.title}
      </h1>
      <p className="mt-6 text-base text-stone-600 leading-7">
        {gateContent.description}
      </p>
      <div className="mt-8 flex gap-4">
        {accessGateActions.map((action) => (
          <a
            key={action.href}
            className="text-sm text-stone-900 underline"
            href={action.href}
          >
            {t(action.key)}
          </a>
        ))}
      </div>
    </AccessGateShell>
  );
}
