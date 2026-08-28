import { getAuthRoutes } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { ShieldXIcon } from "lucide-react";

const Forbidden = async () => {
  const { signOutHref } = await getAuthRoutes();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-lg border-stone-300 bg-card text-center shadow-sm">
        <CardHeader className="items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShieldXIcon className="size-6" />
          </div>
          <div className="grid gap-2">
            <CardTitle className="text-2xl">Admin access required</CardTitle>
            <CardDescription className="text-base leading-7">
              Your account is signed in, but it does not have permission to open
              this workspace. Ask an administrator to grant access, then sign in
              again.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href={signOutHref}>Sign in with another account</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default Forbidden;
