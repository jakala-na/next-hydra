import type { Route } from "next";
import { redirect } from "next/navigation";

export const GET = () => {
  redirect("/register" as Route);
};
