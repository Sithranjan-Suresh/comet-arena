import Link from "next/link";
import { CometMark } from "./Icons";
import { TopNav } from "./NavLinks";

/** Sticky header: logo, desktop navigation, sign-in control. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-40 bg-turf text-chalk shadow-md">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="font-display flex min-h-11 items-center gap-2 text-2xl font-extrabold tracking-wide uppercase"
        >
          <CometMark className="size-7 text-utd-orange" />
          <span>
            Comet <span className="text-utd-orange">Arena</span>
          </span>
        </Link>
        <TopNav />
        <div id="auth-slot">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-lg bg-utd-orange px-4 font-semibold text-ink hover:brightness-95"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
