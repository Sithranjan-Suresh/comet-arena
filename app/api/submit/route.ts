import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createRateLimiter } from "@/lib/rate-limit";
import { MESSAGES, handleSubmission } from "@/lib/submit/handle";
import { createSubmitDeps } from "@/lib/submit/server";
import { MAX_UPLOAD_BYTES } from "@/lib/submit/sniff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const perUser = createRateLimiter({ windowMs: 60 * 60_000, max: 20 });
/** Multipart overhead allowance on top of the 10 MB image limit. */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 512 * 1024;

/**
 * Report a Game: a link (JSON {url}) or a flyer (multipart field "image") in, extracted fields out.
 * Requires a signed-in @utdallas.edu student.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  if (!perUser.allow(auth.user.id)) {
    return NextResponse.json(
      { error: "rate_limited", message: "You are submitting too fast. Try again in a bit." },
      { status: 429, headers: { "retry-after": "600" } },
    );
  }

  // Refuse oversize bodies up front instead of buffering them.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large", message: MESSAGES.tooLarge }, { status: 413 });
  }

  let url: string | null = null;
  let image: { bytes: Uint8Array } | null = null;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_UPLOAD_BYTES)
          return NextResponse.json(
            { error: "too_large", message: MESSAGES.tooLarge },
            { status: 413 },
          );
        image = { bytes: new Uint8Array(await file.arrayBuffer()) };
      }
      const u = form.get("url");
      if (typeof u === "string") url = u;
    } else {
      const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
      if (typeof body?.url === "string") url = body.url;
    }
  } catch {
    return NextResponse.json({ error: "invalid_input", message: MESSAGES.empty }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  try {
    const result = await handleSubmission(
      { userId: auth.user.id, url, image },
      createSubmitDeps(createSupabaseAdminClient()),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: "Something went wrong. Please try again." },
      { status: 503 },
    );
  }
}
