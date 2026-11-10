import { authErrorMessage } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const message = authErrorMessage(error);
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-4xl font-extrabold uppercase">Sign in</h1>
      <p className="text-ink-muted mb-6">
        Save competitions, get deadline warnings and find teammates. Browsing is open to everyone.
        Sign-in is for <strong>@utdallas.edu</strong> students.
      </p>
      {message && (
        <p role="alert" className="bg-critical/10 text-critical mb-6 rounded-lg p-3 font-medium">
          {message}
        </p>
      )}
      <LoginForm next={safeNextPath(next)} />
    </div>
  );
}
