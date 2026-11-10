import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui";
import { confirmTokenSchema } from "@/lib/subscribe";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };
export const dynamic = "force-dynamic";

type SP = { t?: string; done?: string; error?: string };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, done, error } = await searchParams;
  const valid = t ? confirmTokenSchema.safeParse(t).success : false;

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-4 text-4xl font-extrabold uppercase">Comet Arena Weekly</h1>
      {done ? (
        <>
          <p role="status" className="bg-good text-chalk mb-6 rounded-lg p-4 font-semibold">
            You are subscribed. Look for the first one on Sunday evening.
          </p>
          <Link href="/field" className={buttonClasses("primary")}>
            Browse The Field
          </Link>
        </>
      ) : error ? (
        <p role="alert" className="bg-critical/10 text-critical rounded-lg p-4 font-medium">
          {error === "2"
            ? "We could not confirm that right now. Please try the link again in a moment."
            : "This confirmation link is not valid or has expired. Sign up again to get a new one."}
        </p>
      ) : valid ? (
        <form action="/api/subscribe/confirm" method="post" className="space-y-4">
          <p>One click to start getting UTD competitions in your inbox every Sunday evening.</p>
          <input type="hidden" name="t" value={t} />
          <Button type="submit">Confirm my subscription</Button>
        </form>
      ) : (
        <p role="alert" className="bg-critical/10 text-critical rounded-lg p-4 font-medium">
          This confirmation link is not valid. Sign up again to get a new one.
        </p>
      )}
    </main>
  );
}
