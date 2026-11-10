import { NextResponse } from "next/server";
import { verifyInternalKey } from "@/lib/auth/internal-key";
import { createExtractDeps } from "@/lib/extract/deps";
import { EmptyInputError, runExtraction } from "@/lib/extract/service";
import { extractRequestSchema } from "@/lib/schemas";
import { SourceError } from "@/lib/sources";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/**
 * Internal extraction endpoint (engineering_spec §4). Called by ingestion jobs and /api/submit,
 * never by browsers: requires the shared `x-internal-key` header.
 */
export async function POST(request: Request) {
  if (!verifyInternalKey(request.headers.get("x-internal-key"), process.env.EXTRACT_INTERNAL_KEY)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = extractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const outcome = await runExtraction(
      parsed.data,
      createExtractDeps(createSupabaseAdminClient()),
    );
    return NextResponse.json(
      outcome.ok
        ? { ...outcome.extraction, meta: outcome.meta }
        : { ...outcome.error, meta: outcome.meta },
    );
  } catch (e) {
    if (e instanceof EmptyInputError) {
      return NextResponse.json({ error: "empty_input", message: e.message }, { status: 400 });
    }
    if (e instanceof SourceError) {
      if (e.kind === "timeout") return NextResponse.json({ error: "timeout" }, { status: 504 });
      if (e.kind === "rate_limit") {
        return NextResponse.json(
          { error: "rate_limited" },
          {
            status: 429,
            headers: { "retry-after": String(Math.ceil((e.retryAfterMs ?? 1000) / 1000)) },
          },
        );
      }
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    throw e;
  }
}
