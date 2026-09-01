import { SignOutButton } from "@clerk/nextjs";

export interface SignOutProps {
  readonly redirectUrl?: string;
}

export const SignOut = ({ redirectUrl = "/" }: SignOutProps) => (
  <SignOutButton redirectUrl={redirectUrl} />
);
