import { SignIn as ClerkSignIn } from "@clerk/nextjs";

export interface SignInProps {
  readonly path?: string;
}

export const SignIn = ({ path }: SignInProps) => (
  <ClerkSignIn
    appearance={{
      elements: {
        header: "hidden",
      },
    }}
    {...(path ? { path, routing: "path" } : { routing: "hash" })}
  />
);
