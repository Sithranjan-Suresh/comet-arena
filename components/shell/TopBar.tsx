import Link from "next/link";
import { AuthControl } from "@/components/auth/AuthControl";
import { CometMark } from "./Icons";
import { TopNav } from "./NavLinks";

/** Sticky header: logo, desktop navigation, sign-in control. Static (no cookies) so pages can be ISR-cached. */
export function TopBar() {
  return (
    <header className="bg-turf text-chalk sticky top-0 z-40 shadow-md">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="font-display flex min-h-11 items-center gap-2 text-2xl font-extrabold tracking-wide uppercase"
        >
          <CometMark className="text-utd-orange size-7" />
          <span>
            Comet <span className="text-utd-orange">Arena</span>
          </span>
        </Link>
        <TopNav />
        <div id="auth-slot">
          <AuthControl />
        </div>
      </div>
    </header>
  );
}
