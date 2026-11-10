// Renders placeholder flyer PNGs from fixtures/flyers/cases.json (so the image and the canned
// extraction always agree). Run: npm run fixtures:flyers
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadFlyerCases } from "../lib/fixtures";
import { formatCT } from "../lib/time";

const W = 800;
const H = 1000;
const out = path.resolve(process.cwd(), "fixtures/flyers");
mkdirSync(out, { recursive: true });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if ((cur + " " + word).trim().length > max) {
      if (cur) lines.push(cur);
      cur = word;
    } else cur = (cur + " " + word).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function text(
  lines: string[],
  x: number,
  y: number,
  size: number,
  fill: string,
  weight = 400,
  lh = 1.25,
) {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * size * lh}" font-size="${size}" font-weight="${weight}" fill="${fill}" font-family="Arial, Helvetica, sans-serif">${esc(l)}</text>`,
    )
    .join("");
}

function frame(bg: string, accent: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="0" y="0" width="${W}" height="18" fill="${accent}"/>
  <rect x="0" y="${H - 18}" width="${W}" height="18" fill="${accent}"/>
  <circle cx="700" cy="120" r="150" fill="${accent}" opacity="0.12"/>
  ${body}
  <text x="40" y="${H - 40}" font-size="18" fill="#ffffff" opacity="0.7" font-family="Arial, sans-serif">SAMPLE FLYER - generated placeholder</text>
  </svg>`;
}

async function png(svg: string, file: string) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(out, file));
}

for (const c of loadFlyerCases()) {
  const e = c.expected;
  const host = (e.host ?? c.org_slug).toUpperCase();
  const tealish = "#10372a";
  const orange = "#e87500";

  if (e.kind === "not_competition" || (e.kind === "competition" && e.confidence < 0.5)) {
    const body =
      text([host], 40, 90, 30, orange, 700) +
      text(wrap(c.caption.replace(/[^\x20-\x7e]/g, ""), 28), 40, 300, 54, "#ffffff", 700, 1.3);
    await png(frame(tealish, orange, body), c.images[0]);
    continue;
  }

  if (e.kind === "results") {
    const body =
      text([host], 40, 90, 30, orange, 700) +
      text(["CONGRATULATIONS", "TO OUR WINNERS!"], 40, 330, 72, "#ffffff", 800, 1.15) +
      text(wrap(e.title ?? "", 30), 40, 560, 44, orange, 700) +
      text(wrap(c.caption, 44), 40, 700, 26, "#ffffff");
    await png(frame(tealish, orange, body), c.images[0]);
    continue;
  }

  const titleLines = wrap((e.title ?? "").toUpperCase(), 16);
  const stageLines = e.stages.map(
    (s) => `${s.name}: ${formatCT(s.deadline_at, "datetime").replace(/, 20\d\d/, "")}`,
  );
  const noYear = c.id === "f06-no-year";
  const details =
    text(["KEY DATES"], 40, 430, 28, orange, 700) +
    text(
      noYear ? ["Dec 4-5"] : stageLines.flatMap((l) => wrap(l, 34)),
      40,
      480,
      30,
      "#ffffff",
      500,
      1.45,
    ) +
    text(
      [
        e.prize ? `PRIZE: ${e.prize}` : "",
        e.location ? `WHERE: ${e.location}` : "",
        e.cost === "free" ? "FREE TO ENTER" : e.cost === "paid" ? "ENTRY FEE APPLIES" : "",
      ].filter(Boolean),
      40,
      780,
      28,
      "#ffffff",
      600,
      1.5,
    ) +
    text(
      [
        e.register_url
          ? `REGISTER: ${e.register_url.replace("https://", "")}`
          : "REGISTRATION LINK COMING SOON",
      ],
      40,
      900,
      26,
      orange,
      700,
    );

  if (c.images.length > 1) {
    const cover =
      text([host], 40, 90, 30, orange, 700) +
      text(titleLines, 40, 330, 84, "#ffffff", 800, 1.1) +
      text(["SWIPE FOR DETAILS >"], 40, 880, 32, orange, 700);
    await png(frame(tealish, orange, cover), c.images[0]);
    const detail =
      text([host], 40, 90, 30, orange, 700) +
      text(wrap(e.description ?? "", 38), 40, 200, 32, "#ffffff", 500, 1.4) +
      details;
    await png(frame(tealish, orange, detail), c.images[1]);
    continue;
  }

  const body =
    text([host], 40, 90, 30, orange, 700) +
    text(titleLines, 40, 220, 84, "#ffffff", 800, 1.08) +
    details;
  await png(frame(tealish, orange, body), c.images[0]);
}

writeFileSync(path.join(out, ".generated"), `generated from cases.json\n`);
console.log("flyers written to fixtures/flyers");
