import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  UserRoundCogIcon,
} from "lucide-react";
import Link from "next/link";

const experiences = [
  {
    cta: "Open approvals",
    description:
      "Review new registrations, inspect submitted details, and record approval decisions.",
    href: "/admin/registration-approvals",
    icon: ShieldCheckIcon,
    title: "Registration approvals",
  },
  {
    cta: "View space",
    description:
      "Access support tools for stepping into a customer session when that experience is ready.",
    href: "/admin/user-impersonation",
    icon: UserRoundCogIcon,
    title: "User impersonation",
  },
] as const;

export default function AdminOverviewPage() {
  return (
    <div className="grid gap-6">
      <section>
        <Card className="border-stone-300 bg-white/90 shadow-sm backdrop-blur">
          <CardHeader className="gap-3">
            <p className="text-[11px] text-stone-500 uppercase tracking-[0.3em]">
              Overview
            </p>
            <CardTitle className="text-3xl text-stone-950">
              Admin tools
            </CardTitle>
            <CardDescription className="max-w-2xl text-base text-stone-600 leading-7">
              Choose a workspace to review registrations, support customers, and
              handle future admin tasks from one place.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {experiences.map((experience) => {
          const Icon = experience.icon;

          return (
            <Link href={experience.href} key={experience.href}>
              <Card className="h-full border-stone-300 bg-white/95 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader className="gap-4">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-stone-950 text-white">
                    <Icon className="size-5" />
                  </div>
                  <div className="grid gap-2">
                    <CardTitle className="text-stone-950 text-xl">
                      {experience.title}
                    </CardTitle>
                    <CardDescription className="text-base text-stone-600 leading-7">
                      {experience.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center gap-2 font-medium text-sm text-stone-950">
                    {experience.cta}
                    <ArrowRightIcon className="size-4" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
