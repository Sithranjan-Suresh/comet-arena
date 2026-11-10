import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui";
import { UNSUBSCRIBE_MESSAGES } from "@/lib/data/unsubscribe";
import { verifyToken } from "@/lib/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

type SP = { t?: string; done?: string; error?: string };

/**
 * GET shows what the link will do and asks for one click (POST). The change is never made by the GET itself,
 * because email security scanners prefetch links.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, done, error } = await searchParams;
  let payload: ReturnType<typeof verifyToken> = null;
  try {
    payload = t ? verifyToken(t) : null;
  } catch {
    payload = null; // missing secret: treat as an invalid link rather than crashing the page
  }
  const doneKind =
    done && done in UNSUBSCRIBE_MESSAGES ? (done as keyof typeof UNSUBSCRIBE_MESSAGES) : null;

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-4 text-4xl font-extrabold uppercase">Unsubscribe</h1>
      {doneKind ? (
        <>
          <p role="status" className="bg-good text-chalk mb-6 rounded-lg p-4 font-semibold">
            {UNSUBSCRIBE_MESSAGES[doneKind]}
          </p>
          <Link href="/field" className={buttonClasses("primary")}>
            Back to The Field
          </Link>
        </>
      ) : error ? (
        <p role="alert" className="bg-critical/10 text-critical rounded-lg p-4 font-medium">
          We could not process that right now. Please try again in a moment.
        </p>
      ) : payload ? (
        <form action="/api/unsubscribe" method="post" className="space-y-4">
          <p>{UNSUBSCRIBE_MESSAGES[payload.k]}</p>
          <input type="hidden" name="t" value={t} />
          <Button type="submit">Confirm unsubscribe</Button>
        </form>
      ) : (
        <p role="alert" className="bg-critical/10 text-critical rounded-lg p-4 font-medium">
          This unsubscribe link is not valid. Use the link from your most recent email, or change
          your email settings after signing in.
        </p>
      )}
    </main>
  );
}
