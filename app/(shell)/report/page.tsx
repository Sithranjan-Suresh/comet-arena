import { ReportFlow } from "@/components/report/ReportFlow";
import { requireUser } from "@/lib/auth/session";

export const metadata = {
  title: "Report a Game",
  description: "Add a UTD competition from a link or a flyer.",
};
// Per-user page: render on every request.
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  await requireUser("/report");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-4xl font-extrabold uppercase">Report a Game</h1>
      <p className="text-ink-muted mb-8">
        Paste a link to an Instagram post or event page, or upload the flyer. We read it, you check
        it, and it shows up on The Field in seconds.
      </p>
      <ReportFlow />
    </div>
  );
}
