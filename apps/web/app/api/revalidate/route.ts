import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { env } from "@/env";
import {
  cacheTagsFromParameter,
  revalidationSecretsMatch,
} from "@/lib/cms-revalidation";

export function GET(request: Request): NextResponse {
  const { searchParams } = new URL(request.url);

  if (!env.CMS_REVALIDATION_SECRET) {
    return NextResponse.json(
      { error: "CMS revalidation is not configured" },
      { status: 503 }
    );
  }

  if (
    !revalidationSecretsMatch(
      searchParams.get("secret"),
      env.CMS_REVALIDATION_SECRET
    )
  ) {
    return NextResponse.json(
      { error: "Invalid revalidation secret" },
      { status: 401 }
    );
  }

  const tags = cacheTagsFromParameter(searchParams.get("tags"));
  if (tags.length === 0) {
    return NextResponse.json(
      { error: "At least one valid cache tag is required" },
      { status: 400 }
    );
  }

  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({ revalidated: true, tags });
}
