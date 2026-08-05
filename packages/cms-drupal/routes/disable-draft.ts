import type { Route } from "next";
import { redirect } from "next/navigation";
import { disableDrupalPreview } from "../lib/preview-session";

export async function GET(): Promise<never> {
  await disableDrupalPreview();
  redirect("/" as Route);
}
