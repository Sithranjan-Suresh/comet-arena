import type { Category, CompetitionStatus, Role } from "@/lib/schemas";

export const CATEGORY_META: Record<Category, { label: string; dot: string }> = {
  case_competition: { label: "Case comp", dot: "#e87500" },
  hackathon: { label: "Hackathon", dot: "#1b5a43" },
  pitch_competition: { label: "Pitch", dot: "#a8231b" },
  research: { label: "Research", dot: "#5a3e9e" },
  design: { label: "Design", dot: "#c2418a" },
  speaking: { label: "Speaking", dot: "#1f6fb2" },
  finance: { label: "Finance", dot: "#7a4e00" },
  data_science: { label: "Data science", dot: "#0f7b7b" },
  engineering: { label: "Engineering", dot: "#4a5568" },
  health: { label: "Health", dot: "#2f855a" },
  other: { label: "Other", dot: "#5a554b" },
};

export function categoryLabel(c: string): string {
  return (CATEGORY_META as Record<string, { label: string }>)[c]?.label ?? c.replace(/_/g, " ");
}

export const ROLE_LABELS: Record<Role, string> = {
  dev: "Developer",
  design: "Designer",
  data: "Data",
  finance: "Finance",
  research: "Research",
  speaking: "Speaker",
  slides: "Slides",
  business: "Business",
  pm: "Product / PM",
  writing: "Writing",
};

export function roleLabel(r: string): string {
  return (ROLE_LABELS as Record<string, string>)[r] ?? r;
}

export type VerifyTone = "verified" | "unverified" | "expected" | "past";

export interface VerifyMeta {
  tone: VerifyTone;
  label: string;
  /** Screen-reader sentence explaining what the badge means. */
  description: string;
}

/** Product_spec CL/P1: live = host-verified or 3+ confirmations; others are labelled honestly. */
export function verifyMeta(status: CompetitionStatus): VerifyMeta {
  switch (status) {
    case "live":
      return {
        tone: "verified",
        label: "Verified",
        description: "Verified by the host or confirmed by students",
      };
    case "unverified":
      return {
        tone: "unverified",
        label: "Unverified",
        description: "Not yet confirmed by the host. Check the source before registering",
      };
    case "expected":
      return {
        tone: "expected",
        label: "Expected",
        description: "Expected again this year. Dates not announced",
      };
    case "past":
      return { tone: "past", label: "Past", description: "This competition has ended" };
    case "rejected":
      return { tone: "past", label: "Removed", description: "This listing was removed" };
  }
}
