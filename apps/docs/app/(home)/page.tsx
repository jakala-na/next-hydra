import {
  ArrowRight,
  ExternalLink,
  Eye,
  Globe,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { Arcjet } from "@/components/assets/arcjet";
import { Clerk } from "@/components/assets/clerk";
import { Commercetools } from "@/components/assets/commercetools";
import { Contentstack } from "@/components/assets/contentstack";
import { Nextjs } from "@/components/assets/nextjs";
import { Resend } from "@/components/assets/resend";
import { Sentry } from "@/components/assets/sentry";
import { Stripe } from "@/components/assets/stripe";
import { TurborepoIcon } from "@/components/assets/turborepo";
import { Typescript } from "@/components/assets/typescript";
import { Vercel } from "@/components/assets/vercel";
import { WorkOS } from "@/components/assets/workos";
import { default as LightRays } from "@/components/LightRays";
import LogoLoop from "@/components/LogoLoop";
import SpotlightCard from "@/components/SpotlightCard";
import { TerminalCommand } from "@/components/terminal-command";

const starterKitFeatures = [
  {
    description:
      "End-to-end type-safety with GraphQL and gql.tada keeps queries, fragments, and UI contracts aligned across apps and packages.",
    icon: Sparkles,
    title: "Typed GraphQL by default",
  },
  {
    description:
      "Visual Builder support for Contentstack enabled marketers to preview and iterate on their draft content without waiting for builds and deployments.",
    icon: Eye,
    title: "Contentstack Visual Builder",
  },
  {
    description:
      "A robust multi-region B2B commerce model covers regional product discovery, cart actions, and the primitives needed for further expansion.",
    icon: Globe,
    title: "Multi-region B2B commerce",
  },
  {
    description:
      "Security and observability are built in through layered protections, error capture, and operational tooling instead of being deferred to later hardening.",
    icon: ShieldCheck,
    title: "Security and observability",
  },
  {
    description:
      "The opinionated design system encourages clean separation between presentational components and data-fetching orchestration, which keeps teams fast as complexity grows.",
    icon: Layers3,
    title: "Layered UI architecture",
  },
  {
    description:
      "Next.js App Router architecture enables streaming of personalized content and delivers dynamic content at the speed of static.",
    icon: ArrowRight,
    title: "Modern App Router delivery",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate min-h-[85vh] overflow-hidden bg-fd-background">
        <div className="absolute inset-0 -z-10">
          <LightRays
            className="h-full w-full"
            raysColor="#c8a882"
            lightSpread={1.4}
            distortion={0.15}
            noiseAmount={0.02}
          />
        </div>
        <div className="absolute inset-0 -z-5 bg-linear-to-b from-fd-background/20 via-fd-background/5 to-fd-background/50" />
        <div className="container relative z-10 mx-auto flex min-h-[85vh] flex-col items-center justify-center px-4 py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-8 flex justify-center">
              <div className="inline-flex items-center gap-4 rounded-full border border-fd-border bg-fd-card/70 px-5 py-2.5 shadow-sm backdrop-blur-md">
                <span className="inline-flex items-center gap-2 font-medium text-sm">
                  <Nextjs className="h-4 w-4" />
                  Next.js
                </span>
                <span className="h-4 w-px bg-fd-border" />
                <span className="inline-flex items-center gap-2 font-medium text-sm">
                  <Typescript className="h-4 w-4" />
                  TypeScript
                </span>
                <span className="h-4 w-px bg-fd-border" />
                <span className="inline-flex items-center gap-2 font-medium text-sm">
                  <TurborepoIcon className="h-4 w-4" />
                  Turborepo
                </span>
              </div>
            </div>
            <h1 className="mb-6 font-bold text-4xl tracking-tight md:text-6xl">
              Enterprise-ready monorepo template
              <br />
              for <span className="text-fd-primary">digital commerce</span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-fd-muted-foreground text-lg">
              Ship your next digital commerce solution with confidence.
            </p>
            <div className="mb-8">
              <TerminalCommand command="pnpm create next-hydra@latest" />
            </div>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
            >
              Read the docs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="py-10">
        <div className="container mx-auto px-4">
          <LogoLoop
            logos={[
              {
                node: <Nextjs key="nextjs" />,
                title: "Next.js",
              },
              {
                node: <Vercel key="vercel" />,
                title: "Vercel",
              },
              {
                node: <Typescript key="typescript" />,
                title: "TypeScript",
              },
              {
                node: <TurborepoIcon key="turborepo" />,
                title: "Turborepo",
              },
              {
                node: <Commercetools key="commercetools" />,
                title: "Commercetools",
              },
              {
                node: <Contentstack key="contentstack" />,
                title: "Contentstack",
              },
              {
                node: <Sentry key="sentry" />,
                title: "Sentry",
              },
              {
                node: <Stripe key="stripe" />,
                title: "Stripe",
              },
              {
                node: <Clerk key="clerk" />,
                title: "Clerk",
              },
              {
                node: <WorkOS key="workos" />,
                title: "WorkOS",
              },
              {
                node: <Resend key="resend" />,
                title: "Resend",
              },
              {
                node: <Arcjet key="arcjet" />,
                title: "Arcjet",
              },
            ]}
          />
        </div>
      </div>

      <section className="relative overflow-hidden border-fd-border border-b py-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(200,168,130,0.12),transparent_38%),linear-gradient(180deg,transparent,rgba(0,0,0,0.04))]" />
        <div className="container mx-auto px-4">
          <div className="mb-12 flex max-w-3xl flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-fd-border bg-fd-card/70 px-4 py-2 font-medium text-fd-muted-foreground text-xs uppercase tracking-[0.24em]">
              Included Features
            </span>
            <h2 className="max-w-2xl font-bold text-3xl tracking-tight md:text-5xl">
              Chef's selection of features to help you ship faster.
            </h2>
            <p className="max-w-2xl text-base text-fd-muted-foreground md:text-lg">
              The template is opinionated where enterprise commerce projects
              usually get fragile: content workflows, personalization,
              integrations, and operational guardrails.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {starterKitFeatures.map((feature) => {
              const Icon = feature.icon;

              return (
                <SpotlightCard
                  key={feature.title}
                  className="group h-full border-fd-border bg-fd-card/85 p-0 backdrop-blur-sm"
                  spotlightColor="rgba(200, 168, 130, 0.16)"
                >
                  <div className="flex h-full flex-col gap-5 p-6">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-fd-border bg-fd-background/80 text-fd-primary shadow-sm transition-transform duration-300 group-hover:scale-105">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-[0.7rem] text-fd-muted-foreground uppercase tracking-[0.24em]">
                        Included
                      </span>
                    </div>
                    <div className="space-y-3">
                      <h3 className="font-semibold text-fd-foreground text-xl tracking-tight">
                        {feature.title}
                      </h3>
                      <p className="text-balance text-fd-muted-foreground leading-7">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-fd-border border-t py-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(200,168,130,0.16),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.02),transparent_35%)]" />
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-[2rem] border border-fd-border bg-fd-card/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)] backdrop-blur-sm md:p-12">
            <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-fd-primary/60 to-transparent" />
            <div className="absolute -top-24 right-0 -z-10 h-56 w-56 rounded-full bg-fd-primary/10 blur-3xl" />
            <div className="absolute -bottom-20 left-8 -z-10 h-48 w-48 rounded-full bg-fd-primary/8 blur-3xl" />

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-end">
              <div className="max-w-2xl">
                <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-fd-border bg-fd-background/70 px-4 py-2 font-medium text-[0.7rem] text-fd-muted-foreground uppercase tracking-[0.24em]">
                  Reliable Architecture
                </span>
                <h2 className="max-w-xl font-bold text-3xl tracking-tight md:text-5xl">
                  Architecture for humans and agents to collaborate.
                </h2>
                <p className="mt-5 max-w-xl text-base text-fd-muted-foreground leading-8 md:text-lg">
                  Start with a solid foundation and clear guidelines before you
                  let agents take over your architecture.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    href="/docs"
                    className="inline-flex items-center gap-2 rounded-xl bg-fd-primary px-6 py-3.5 font-medium text-fd-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-fd-primary/90"
                  >
                    Read the docs
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="https://github.com/jakala-na/next-hydra"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-fd-border bg-fd-background/80 px-6 py-3.5 font-medium transition-all hover:-translate-y-0.5 hover:bg-fd-accent"
                  >
                    View on GitHub
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-fd-border bg-fd-background/65 p-4 shadow-sm">
                  <TerminalCommand command="pnpm create next-hydra@latest" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-fd-border bg-fd-background/60 p-4">
                    <p className="font-medium text-fd-foreground text-sm">
                      Precomposed solution
                    </p>
                    <p className="mt-2 text-fd-muted-foreground text-sm leading-6">
                      CMS, commerce and auth at the core, with powerful addons
                      for feature flags, rate-limiting, emails, analytics and
                      more.
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-fd-border bg-fd-background/60 p-4">
                    <p className="font-medium text-fd-foreground text-sm">
                      Hardened for production
                    </p>
                    <p className="mt-2 text-fd-muted-foreground text-sm leading-6">
                      Security, observability, error objects, type-safety from
                      day one.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
