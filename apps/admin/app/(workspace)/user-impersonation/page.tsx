import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";

export default function UserImpersonationPage() {
  return (
    <div className="grid gap-6">
      <section>
        <Card className="border-stone-300 bg-white/90 shadow-sm backdrop-blur">
          <CardHeader className="gap-3">
            <p className="text-[11px] text-stone-500 uppercase tracking-[0.3em]">
              Customer support
            </p>
            <CardTitle className="text-3xl text-stone-950">
              User impersonation
            </CardTitle>
            <CardDescription className="max-w-2xl text-base text-stone-600 leading-7">
              This space is reserved for secure customer support tools,
              including user impersonation.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-stone-300 border-dashed bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-stone-950 text-xl">Coming soon</CardTitle>
          <CardDescription>
            We will add guided customer session access here next, alongside the
            controls needed to review who started a support session and why.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-stone-600 leading-7">
          When this launches, it should follow the same admin navigation and
          approval patterns as the rest of this workspace.
        </CardContent>
      </Card>
    </div>
  );
}
