import { CATEGORIES, type Category } from "@/lib/schemas";

/** What each category means, shown to the model so classification is consistent. */
export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  case_competition: "teams solve a business/consulting/policy case and present to judges",
  hackathon:
    "build software or hardware in a fixed time window (hackathons, jams, sprints, build challenges)",
  pitch_competition: "pitch a startup or idea for funding or prizes",
  research: "research showcases, poster sessions, thesis or abstract competitions",
  design: "design sprints, UX/UI, art or architecture design contests",
  speaking: "debate, public speaking, speech or mock trial contests",
  finance: "investment, trading, stock-pitch and finance challenges",
  data_science: "data science, analytics, machine learning or AI challenges",
  engineering: "engineering design, robotics, build or competition teams",
  health: "pre-health, clinical, public health or biomedical competitions",
  other: "a competition that fits none of the above",
};

export function categoryList(): string {
  return CATEGORIES.map((c) => `- ${c}: ${CATEGORY_DESCRIPTIONS[c]}`).join("\n");
}
