import type { ReviewAction } from "./review";

export async function submitReviewAction(
  id: string,
  action: ReviewAction,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/admin/review/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    const body = (await res.json().catch(() => ({}))) as { outcome?: string; message?: string };
    if (!res.ok) return { ok: false, message: body.message ?? "Something went wrong." };
    return {
      ok: true,
      message:
        body.outcome === "rejected"
          ? "Rejected"
          : body.outcome === "merged"
            ? "Merged into the existing listing"
            : "Published",
    };
  } catch {
    return { ok: false, message: "Network problem. Try again." };
  }
}
