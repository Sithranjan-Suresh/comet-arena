import Link from "next/link";
import { Providers } from "@/components/Providers";
import { BottomTabs } from "@/components/shell/NavLinks";
import { Ticker } from "@/components/shell/Ticker";
import { TopBar } from "@/components/shell/TopBar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <a
        href="#main"
        className="bg-chalk text-ink sr-only z-50 rounded-md px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <TopBar />
      {/* Bottom padding leaves room for the mobile tab bar (and the ticker, Task 29). */}
      <main id="main" className="mx-auto min-h-[70dvh] max-w-6xl px-4 pt-6 pb-8">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-36 text-sm md:pb-16">
        <nav aria-label="Footer" className="text-ink-muted flex flex-wrap gap-x-5 gap-y-2">
          <span>Comet Arena is not affiliated with UT Dallas.</span>
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </nav>
      </footer>
      <Ticker />
      <BottomTabs />
    </Providers>
  );
}
