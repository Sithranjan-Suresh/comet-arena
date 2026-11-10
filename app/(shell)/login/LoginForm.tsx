"use client";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { UTD_EMAIL_MESSAGE, isUtdEmail } from "@/lib/auth/email";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string>();

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setFormError(undefined);
    const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      // `hd` only pre-filters Google's account picker; the database enforces the real rule.
      options: {
        redirectTo: redirectTo(),
        queryParams: { hd: "utdallas.edu", prompt: "select_account" },
      },
    });
    if (error) {
      setFormError("Could not start Google sign-in. Please try again.");
      setGoogleLoading(false);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (!isUtdEmail(email)) {
      setEmailError(UTD_EMAIL_MESSAGE);
      return;
    }
    setEmailError(undefined);
    setStatus("sending");
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
    });
    if (error) {
      setStatus("error");
      setFormError(
        error.message.toLowerCase().includes("database")
          ? UTD_EMAIL_MESSAGE
          : "We could not send the link. Please try again.",
      );
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div role="status" className="rounded-xl bg-turf p-5 text-chalk">
        <h2 className="text-2xl font-bold">Check your email</h2>
        <p className="mt-1">
          We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. It expires in an
          hour.
        </p>
        <Button
          variant="ghost"
          className="mt-3 text-chalk hover:bg-turf-light"
          onClick={() => setStatus("idle")}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button className="w-full" loading={googleLoading} onClick={signInWithGoogle}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-court-dark" />
        or
        <span className="h-px flex-1 bg-court-dark" />
      </div>

      <form onSubmit={sendMagicLink} noValidate className="space-y-3">
        <Input
          label="UTD email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="netid@utdallas.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          hint="We email you a one-time sign-in link."
        />
        <Button type="submit" variant="secondary" className="w-full" loading={status === "sending"}>
          Email me a sign-in link
        </Button>
      </form>

      {formError && (
        <p role="alert" className="text-critical text-sm font-medium">
          {formError}
        </p>
      )}
    </div>
  );
}
