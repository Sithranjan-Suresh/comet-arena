import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { supabasePushStore } from "@/lib/notify/push-store";
import { pushToUser } from "@/lib/notify/push";
import { getSources } from "@/lib/sources";

/** Send a test notification to the caller's own browsers. */
export async function POST() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    const result = await pushToUser(
      { sender: getSources().push, store: supabasePushStore(auth.supabase) },
      auth.user.id,
      {
        title: "Comet Arena",
        body: "Notifications are on. We will warn you before deadlines.",
        url: "/schedule",
        tag: "test",
      },
    );
    if (result.delivered === 0 && result.removed === 0 && result.failed === 0)
      return NextResponse.json(
        { error: "no_subscription", message: "Turn notifications on for this device first." },
        { status: 404 },
      );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: "Something went wrong. Try again." },
      { status: 503 },
    );
  }
}
