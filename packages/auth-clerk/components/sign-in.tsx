import { SignIn as ClerkSignIn } from "@clerk/nextjs";

export interface SignInProps {
  readonly fallbackRedirectUrl?: string;
  readonly path?: string;
}

export const SignIn = ({ fallbackRedirectUrl, path }: SignInProps) => (
  <ClerkSignIn
    appearance={{
      elements: {
        header: "hidden",
        rootBox: "mx-auto",
      },
    }}
    fallbackRedirectUrl={fallbackRedirectUrl}
    {...(path ? { path, routing: "path" } : { routing: "hash" })}
  />
);
