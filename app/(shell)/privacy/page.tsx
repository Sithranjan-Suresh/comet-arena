import Link from "next/link";

export const metadata = {
  title: "Privacy",
  description: "What Comet Arena stores, who can see it, and how to delete it.",
};

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="mb-2 text-4xl font-extrabold uppercase">Privacy</h1>
        <p className="text-ink-muted">Plain language, short. Last updated November 2026.</p>
      </header>

      <section aria-labelledby="visitors" className="space-y-2">
        <h2 id="visitors" className="text-2xl font-bold">
          If you only browse
        </h2>
        <p>
          The Field, Game Day pages and club pages are public. We do not need an account for them,
          and we do not run advertising or cross-site tracking. We keep ordinary server logs for
          security.
        </p>
      </section>

      <section aria-labelledby="accounts" className="space-y-2">
        <h2 id="accounts" className="text-2xl font-bold">
          If you sign in
        </h2>
        <p>Only @utdallas.edu accounts can sign in. We store what you give us:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your UTD email and name from sign-in.</li>
          <li>
            Your major, class year, courses, interests and roles, to rank competitions for you and
            check eligibility.
          </li>
          <li>The competitions you save, and your email-warning and digest settings.</li>
          <li>Results you add to your Player Card. It is private: only you can see it.</li>
          <li>
            Free Agency posts. Your first name and role are public; your email is shown only to
            other signed-in UTD students, and only on posts you create.
          </li>
          <li>Competitions you report, which are public once published.</li>
        </ul>
      </section>

      <section aria-labelledby="weekly" className="space-y-2">
        <h2 id="weekly" className="text-2xl font-bold">
          Comet Arena Weekly
        </h2>
        <p>
          If you sign up for the weekly email without an account, we store your email and when you
          confirmed it. Every email has a one-click unsubscribe link.
        </p>
      </section>

      <section aria-labelledby="posts" className="space-y-2">
        <h2 id="posts" className="text-2xl font-bold">
          Where competitions come from
        </h2>
        <p>
          We read public posts from club Instagram accounts through Meta&apos;s official API, public
          event calendars and department pages, and what students report. We store the public
          caption, link and flyer image. We never read private accounts, stories, messages or
          follower lists.
        </p>
      </section>

      <section aria-labelledby="services" className="space-y-2">
        <h2 id="services" className="text-2xl font-bold">
          Services that handle your data
        </h2>
        <p>
          Supabase (database and sign-in), Vercel (hosting), Resend (email), and an AI provider that
          reads flyer text and images to extract dates. Flyers and captions go to the AI provider;
          your profile does not.
        </p>
      </section>

      <section aria-labelledby="delete" className="space-y-2">
        <h2 id="delete" className="text-2xl font-bold">
          Delete your data
        </h2>
        <p>
          Signed in, go to{" "}
          <Link href="/settings" className="font-semibold underline">
            Settings
          </Link>{" "}
          and choose Delete account. That removes your profile, saves, results and Free Agency
          posts. Competitions you reported stay listed but are no longer linked to you.
          {contact ? (
            <>
              {" "}
              Questions:{" "}
              <a className="font-semibold underline" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </>
          ) : null}
        </p>
      </section>
    </article>
  );
}
