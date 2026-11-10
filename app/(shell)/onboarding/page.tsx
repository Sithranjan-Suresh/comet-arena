import { ProfileForm } from "@/components/profile/ProfileForm";
import { requireUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileData } from "@/lib/schemas/profile";

// Per-user page: must render on every request (never prerendered into a frozen redirect).
export const dynamic = "force-dynamic";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await requireUser("/onboarding");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("major,class_year,interests,roles,email_warnings,digest,public_results,onboarded")
    .eq("id", user.id)
    .maybeSingle();

  const initial: ProfileData = data ?? {
    major: null,
    class_year: null,
    interests: [],
    roles: [],
    email_warnings: true,
    digest: true,
    public_results: false,
    onboarded: false,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-4xl font-extrabold uppercase">Pick your position</h1>
      <p className="text-ink-muted mb-8">
        Four quick questions so your Scouting Report shows competitions you qualify for. Takes about
        a minute and you can change it any time.
      </p>
      <ProfileForm initial={initial} mode="onboarding" next={safeNextPath(next)} />
    </div>
  );
}
