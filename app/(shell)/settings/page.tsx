import { CalendarFeedCard } from "@/components/profile/CalendarFeedCard";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("users")
    .select("major,class_year,interests,roles,email_warnings,digest,onboarded,ics_token")
    .eq("id", user.id)
    .single();

  if (!data) throw new Error("Profile not found");
  const { ics_token, ...profile } = data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="mb-2 text-4xl font-extrabold uppercase">Settings</h1>
        <p className="text-ink-muted">Signed in as {user.email}</p>
      </div>
      <ProfileForm initial={profile} mode="settings" />
      <CalendarFeedCard appUrl={appUrl} initialToken={ics_token} />
      <DeleteAccount />
    </div>
  );
}
