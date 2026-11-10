import { ImageResponse } from "next/og";
import { getGameDayBySlug } from "@/lib/data/field";
import { SLUG_PATTERN } from "@/lib/data/game-day";
import { ogTitleFontSize } from "@/lib/og";
import { formatCT } from "@/lib/time";

export const alt = "Comet Arena competition";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TURF = "#10372a";
const ORANGE = "#e87500";
const CHALK = "#f6f1e7";
const MUTED = "#c9d4cd";
const LED = "#ffb000";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dto =
    SLUG_PATTERN.test(slug) && slug.length <= 120
      ? await getGameDayBySlug(slug).catch(() => null)
      : null;

  const title = dto?.title ?? "Every UTD competition in one place";
  const next = dto?.stages.find((s) => new Date(s.deadline_at) >= new Date());
  const line = dto
    ? [
        dto.host_name,
        next
          ? `${next.name}: ${formatCT(next.deadline_at)}`
          : dto.status === "expected"
            ? "Expected again, dates coming"
            : null,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : "Never miss a UTD competition. Never compete alone.";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: TURF,
        color: CHALK,
        padding: 64,
        borderTop: `16px solid ${ORANGE}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: 2,
        }}
      >
        <span style={{ color: CHALK }}>COMET&nbsp;</span>
        <span style={{ color: ORANGE }}>ARENA</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: ogTitleFontSize(title),
            fontWeight: 800,
            lineHeight: 1.05,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 34, color: MUTED }}>{line}</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 28,
        }}
      >
        <div style={{ display: "flex", color: LED, fontWeight: 700, letterSpacing: 3 }}>
          {dto?.prize ? `PRIZE ${dto.prize.toUpperCase()}` : "UT DALLAS"}
        </div>
        <div style={{ display: "flex", color: MUTED }}>Never miss one. Never compete alone.</div>
      </div>
    </div>,
    size,
  );
}
