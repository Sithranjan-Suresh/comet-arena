import { NextResponse } from "next/server";
import { verifyInternalKey } from "@/lib/auth/internal-key";
import { loadDeptConfig } from "@/lib/dept/config";
import { parseInbound, senderAllowed } from "@/lib/dept/inbound";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 1_500_000;

/**
 * Inbound newsletter webhook (Postmark, Resend, SendGrid, Mailgun). Configure the provider to POST here with
 * `?secret=<INBOUND_EMAIL_SECRET>` or an `x-webhook-secret` header. The message is only stored; the ingest-dept
 * job reads it later, so a slow model never makes the provider time out and retry. Mail from senders that are
 * not on the allowlist is acknowledged and dropped (a 200, so spammers learn nothing).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const provided = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
  if (!verifyInternalKey(provided, process.env.INBOUND_EMAIL_SECRET))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
    return NextResponse.json({ error: "too_large" }, { status: 413 });

  let payload: unknown;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const text = await request.text();
      if (text.length > MAX_BYTES)
        return NextResponse.json({ error: "too_large" }, { status: 413 });
      payload = JSON.parse(text);
    } else {
      const form = await request.formData();
      payload = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    }
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const msg = parseInbound(payload);
  if (!msg) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!senderAllowed(msg.from, loadDeptConfig().senders))
    return NextResponse.json({ accepted: false });

  const { error } = await createSupabaseAdminClient()
    .from("inbound_messages")
    .upsert(
      { message_id: msg.messageId, sender: msg.from, subject: msg.subject, body: msg.body },
      { onConflict: "message_id", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 }); // the provider will retry
  return NextResponse.json({ accepted: true });
}
