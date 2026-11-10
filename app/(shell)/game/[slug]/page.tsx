import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddEntryDialog } from "@/components/entries/AddEntryDialog";
import { EligibilityCheck } from "@/components/game-day/EligibilityCheck";
import { FreeAgencyBoard } from "@/components/free-agency/FreeAgencyBoard";
import { GameHeader, InfoGrid, RegisterButton, SourceList } from "@/components/game-day/parts";
import { SaveButton } from "@/components/SaveButton";
import { StageTimeline } from "@/components/StageTimeline";
import { getGameDayBySlug } from "@/lib/data/field";
import { SLUG_PATTERN } from "@/lib/data/game-day";
import { eligibilityLines, eventJsonLd } from "@/lib/format";
import { registrationClosed } from "@/lib/free-agency";
import { formatCT } from "@/lib/time";

// Render on first request, then serve from the ISR cache and refresh every 5 minutes (data is also tagged
// "competitions" so a publish revalidates it at once). Viewer-specific state (saved, eligibility) loads client-side.
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) return null;
  return getGameDayBySlug(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dto = await load((await params).slug);
  if (!dto) return { title: "Competition not found" };
  const next = dto.stages.find((s) => new Date(s.deadline_at) >= new Date());
  const description = [
    dto.description?.slice(0, 140),
    next ? `${next.name}: ${formatCT(next.deadline_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: dto.title,
    description,
    openGraph: { title: dto.title, description, type: "website" },
  };
}

export default async function GameDayPage({ params }: Props) {
  const { slug } = await params;
  const dto = await load(slug);
  if (!dto) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: eventJsonLd(dto, appUrl) }}
      />

      <GameHeader dto={dto} />

      <div className="flex flex-wrap items-center gap-3">
        <RegisterButton dto={dto} />
        <SaveButton competitionId={dto.id} title={dto.title} />
        <AddEntryDialog competitionId={dto.id} title={dto.title} stageCount={dto.stages.length} />
      </div>

      {dto.description && <p className="text-lg leading-relaxed">{dto.description}</p>}

      <InfoGrid dto={dto} />

      <section aria-labelledby="stages">
        <h2 id="stages" className="mb-3 text-2xl font-bold">
          Schedule
        </h2>
        <StageTimeline stages={dto.stages} />
      </section>

      <section aria-labelledby="eligibility" className="space-y-2">
        <h2 id="eligibility" className="text-2xl font-bold">
          Who can enter
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {eligibilityLines(dto.eligibility).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <EligibilityCheck slug={dto.slug} />
      </section>

      <FreeAgencyBoard
        slug={dto.slug}
        competitionId={dto.id}
        title={dto.title}
        registrationClosed={dto.status === "past" || registrationClosed(dto.stages)}
      />

      <SourceList dto={dto} />
      {/* "Report a problem" flag button slot: filled by Task 115. */}
    </article>
  );
}
