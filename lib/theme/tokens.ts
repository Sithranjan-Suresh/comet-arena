/**
 * Design tokens (engineering_spec §2). Source of truth for colors; app/globals.css mirrors these
 * values in @theme (tests/theme.test.ts fails if they drift or if a text pair drops below WCAG AA).
 */
export const colors = {
  court: "#efe3cf", // hardwood neutral: page background
  "court-dark": "#d9c8a9", // hardwood grain, borders and dividers
  turf: "#10372a", // deep green surface (cards, panels)
  "turf-light": "#1b5a43",
  "utd-orange": "#e87500",
  "utd-green": "#154734",
  scoreboard: "#0e0f0c", // near-black LED panel
  led: "#ffb000", // amber digits
  ink: "#1b1a17", // body text on court
  "ink-muted": "#5a554b", // secondary text on court
  chalk: "#f6f1e7", // text on turf / utd-green / scoreboard
  "chalk-muted": "#c9d4cd", // secondary text on turf
  good: "#1e6b34",
  warn: "#7a4e00",
  critical: "#a8231b",
} as const;

export type ColorToken = keyof typeof colors;

/** Foreground/background pairs the UI actually uses, with the minimum ratio each must meet. */
export const textPairs: { fg: ColorToken; bg: ColorToken; min: number; use: string }[] = [
  { fg: "ink", bg: "court", min: 4.5, use: "body text" },
  { fg: "ink-muted", bg: "court", min: 4.5, use: "secondary text" },
  { fg: "chalk", bg: "turf", min: 4.5, use: "text on cards" },
  { fg: "chalk-muted", bg: "turf", min: 4.5, use: "secondary text on cards" },
  { fg: "chalk", bg: "utd-green", min: 4.5, use: "text on green" },
  { fg: "ink", bg: "utd-orange", min: 4.5, use: "primary button label" },
  { fg: "led", bg: "scoreboard", min: 4.5, use: "LED countdown digits" },
  { fg: "chalk", bg: "scoreboard", min: 4.5, use: "text on scoreboard" },
  { fg: "good", bg: "court", min: 4.5, use: "success text" },
  { fg: "warn", bg: "court", min: 4.5, use: "warning text" },
  { fg: "critical", bg: "court", min: 4.5, use: "error text" },
  { fg: "utd-orange", bg: "turf", min: 3, use: "orange accent on cards (large text / icons)" },
];
