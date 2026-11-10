import { notFound } from "next/navigation";
import { contrastRatio } from "@/lib/theme/contrast";
import { colors, textPairs } from "@/lib/theme/tokens";
import { Countdown } from "@/components/Countdown";
import { StageTimeline } from "@/components/StageTimeline";
import { UiDemo } from "./UiDemo";

export const metadata = { title: "Design tokens" };
// Evaluate the production guard per request, not at build time.
export const dynamic = "force-dynamic";

export default function TokensPage() {
  // Internal showcase: hidden in production unless explicitly enabled.
  if (process.env.NODE_ENV === "production" && !process.env.SHOW_DEV_PAGES) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6">
      <header>
        <h1 className="text-3xl font-bold">Design tokens</h1>
        <p className="text-ink-muted">Comet Arena color system with WCAG contrast ratios.</p>
      </header>

      <section aria-labelledby="swatches">
        <h2 id="swatches" className="mb-3 text-xl font-semibold">
          Colors
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {Object.entries(colors).map(([name, hex]) => (
            <li key={name} className="overflow-hidden rounded-lg border border-court-dark">
              <div className="h-16" style={{ background: hex }} />
              <div className="p-2 text-sm">
                <div className="font-semibold">{name}</div>
                <div className="font-mono text-ink-muted">{hex}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="type">
        <h2 id="type" className="mb-3 text-xl font-semibold">
          Typography
        </h2>
        <div className="space-y-3 rounded-lg bg-turf p-5 text-chalk">
          <p className="font-display text-5xl font-extrabold uppercase">Never compete alone</p>
          <p className="font-display text-2xl font-bold">Heading / jersey display face</p>
          <p>Body text uses a clean sans so long descriptions stay readable on a phone.</p>
        </div>
        <div className="mt-3 rounded-lg bg-scoreboard p-5">
          <p className="led-digits text-5xl" aria-label="3 days 4 hours 12 minutes">
            03d 04h 12m
          </p>
        </div>
      </section>

      <section aria-labelledby="timeline">
        <h2 id="timeline" className="mb-3 text-xl font-semibold">
          Stage timeline and countdown
        </h2>
        <div className="mb-4 flex flex-wrap gap-3">
          <Countdown
            deadline={new Date(Date.now() + (3 * 24 + 4) * 3600_000 + 12 * 60_000).toISOString()}
          />
          <Countdown deadline={new Date(Date.now() + 4 * 3600_000).toISOString()} />
          <Countdown deadline={new Date(Date.now() - 3600_000).toISOString()} />
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[1, 3, 5].map((n) => (
            <StageTimeline
              key={n}
              stages={Array.from({ length: n }, (_, i) => ({
                name: ["Registration closes", "Case released", "Round 1", "Semifinals", "Finals"][
                  i
                ],
                starts_at:
                  i === 4 ? new Date(Date.now() + (i * 9 - 5) * 86400_000).toISOString() : null,
                deadline_at: new Date(Date.now() + (i * 9 - 4) * 86400_000).toISOString(),
                order: i + 1,
              }))}
            />
          ))}
        </div>
      </section>

      <UiDemo />

      <section aria-labelledby="contrast">
        <h2 id="contrast" className="mb-3 text-xl font-semibold">
          Text contrast
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {textPairs.map(({ fg, bg, min, use }) => {
            const ratio = contrastRatio(colors[fg], colors[bg]);
            return (
              <li
                key={`${fg}-${bg}`}
                className="flex items-center justify-between rounded-lg p-3"
                style={{ background: colors[bg], color: colors[fg] }}
              >
                <span>
                  {use}
                  <span className="block text-xs opacity-90">
                    {fg} on {bg}
                  </span>
                </span>
                <span className="font-mono text-sm">
                  {ratio.toFixed(2)}:1 {ratio >= min ? "AA pass" : "FAIL"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
