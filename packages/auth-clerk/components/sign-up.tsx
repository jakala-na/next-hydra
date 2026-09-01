import { SignUp as ClerkSignUp } from "@clerk/nextjs";

export interface SignUpProps {
  readonly fallbackRedirectUrl?: string;
  readonly path?: string;
}

export const SignUp = ({ fallbackRedirectUrl, path }: SignUpProps) => (
  <ClerkSignUp
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
