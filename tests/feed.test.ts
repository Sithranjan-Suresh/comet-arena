import { describe, expect, it } from "vitest";
import { toFeedCompetition } from "@/lib/data/feed";
import { type FeedCompetition, type FeedProfile, URGENT_DAYS, rankFeed } from "@/lib/feed";

const NOW = new Date("2026-11-10T15:00:00Z");
const DAY = 86_400_000;
let n = 0;
const comp = (
  title: string,
  over: {
    days?: number | null;
    cats?: string[];
    status?: string;
    elig?: FeedCompetition["eligibility"];
  } = {},
): FeedCompetition => {
  n++;
  const days = over.days === undefined ? 20 : over.days;
  return {
    card: {
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      slug: title.toLowerCase().replace(/\W+/g, "-"),
      title,
      host_name: "AIS",
      host_slug: "ais",
      categories: (over.cats ?? ["case_competition"]) as never,
      prize: null,
      status: (over.status ?? "live") as never,
      next_stage:
        days === null
          ? null
          : {
              id: `s${n}`,
              name: "Reg",
              starts_at: null,
              deadline_at: new Date(NOW.getTime() + days * DAY).toISOString(),
              order: 1,
            },
      viewer_saved: false,
    },
    eligibility: over.elig ?? null,
  };
};
const me = (over: Partial<FeedProfile> = {}): FeedProfile => ({
  major: "Computer Science",
  class_year: "junior",
  interests: [],
  courses: [],
  ...over,
});
const titles = (items: { card: { title: string } }[]) => items.map((i) => i.card.title);

describe("rankFeed", () => {
  it("sorts by next deadline, with undated competitions last", () => {
    const out = rankFeed(
      [
        comp("Later", { days: 30 }),
        comp("Undated", { days: null, status: "expected" }),
        comp("Sooner", { days: 14 }),
      ],
      me(),
      NOW,
    );
    expect(titles(out)).toEqual(["Sooner", "Later", "Undated"]);
  });

  it("puts anything due within a week first, even if it does not match interests", () => {
    const out = rankFeed(
      [
        comp("Far match", { days: 20, cats: ["hackathon"] }),
        comp("Urgent other", { days: URGENT_DAYS - 1, cats: ["design"] }),
      ],
      me({ interests: ["hackathon"] }),
      NOW,
    );
    expect(titles(out)).toEqual(["Urgent other", "Far match"]);
  });

  it("boosts chosen interests within the same urgency bucket, then by deadline", () => {
    const out = rankFeed(
      [
        comp("Soon other", { days: 12, cats: ["design"] }),
        comp("Later match", { days: 25, cats: ["hackathon"] }),
        comp("Sooner match", { days: 15, cats: ["hackathon"] }),
        comp("Urgent", { days: 3, cats: ["design"] }),
      ],
      me({ interests: ["hackathon"] }),
      NOW,
    );
    expect(titles(out)).toEqual(["Urgent", "Sooner match", "Later match", "Soon other"]);
  });

  it("filters out competitions the viewer is known to be ineligible for, but keeps 'unknown'", () => {
    const finance = comp("Finance only", {
      elig: { majors: ["Finance"], class_years: [], course_prereqs: [], cross_school: false },
    });
    const seniors = comp("Seniors only", {
      elig: { majors: [], class_years: ["senior"], course_prereqs: [], cross_school: false },
    });
    const open = comp("Open");
    expect(titles(rankFeed([finance, seniors, open], me(), NOW))).toEqual(["Open"]);
    // no profile yet: nothing can be ruled out
    expect(
      titles(rankFeed([finance, seniors, open], me({ major: null, class_year: null }), NOW)).sort(),
    ).toEqual(["Finance only", "Open", "Seniors only"]);
  });

  it("drops past, rejected and already-passed items", () => {
    const out = rankFeed(
      [
        comp("Past", { status: "past" }),
        comp("Rejected", { status: "rejected" }),
        comp("Yesterday", { days: -1 }),
        comp("Keep", { days: 5 }),
      ],
      me(),
      NOW,
    );
    expect(titles(out)).toEqual(["Keep"]);
  });

  it("explains each ranking with reasons the UI can show as chips", () => {
    const qualifies = comp("Mine", {
      days: 3,
      cats: ["hackathon"],
      elig: {
        majors: ["Computer Science"],
        class_years: [],
        course_prereqs: [],
        cross_school: false,
      },
    });
    const open = comp("Open", { days: 30 });
    const [a, b] = rankFeed([qualifies, open], me({ interests: ["hackathon"] }), NOW);
    expect(a.reasons).toEqual(["closing_soon", "matches_interests", "you_qualify"]);
    expect(b.reasons).toEqual(["open_to_all"]);
  });

  it("is deterministic: equal deadlines break ties on title", () => {
    const a = rankFeed([comp("Zeta", { days: 20 }), comp("Alpha", { days: 20 })], me(), NOW);
    const b = rankFeed([comp("Alpha", { days: 20 }), comp("Zeta", { days: 20 })], me(), NOW);
    expect(titles(a)).toEqual(["Alpha", "Zeta"]);
    expect(titles(b)).toEqual(["Alpha", "Zeta"]);
  });

  it("does not mutate its input and handles an empty list", () => {
    const input = [comp("B", { days: 20 }), comp("A", { days: 10 })];
    const copy = [...input];
    rankFeed(input, me(), NOW);
    expect(input).toEqual(copy);
    expect(rankFeed([], me(), NOW)).toEqual([]);
  });
});

describe("toFeedCompetition", () => {
  it("builds a card with the next upcoming stage and resolves to-one relations", () => {
    const f = toFeedCompetition(
      {
        id: "i",
        slug: "s",
        title: "T",
        host_name: "H",
        categories: ["hackathon"],
        prize: "$1",
        status: "live",
        org: [{ slug: "ais" }],
        stages: [
          {
            id: "old",
            name: "Old",
            starts_at: null,
            deadline_at: new Date(NOW.getTime() - DAY).toISOString(),
            order: 1,
          },
          {
            id: "n",
            name: "Next",
            starts_at: null,
            deadline_at: new Date(NOW.getTime() + DAY).toISOString(),
            order: 2,
          },
        ],
        eligibility: [{ majors: [], class_years: [], course_prereqs: [], cross_school: false }],
      },
      NOW,
    );
    expect(f.card).toMatchObject({ host_slug: "ais", next_stage: { id: "n", name: "Next" } });
    expect(f.eligibility).not.toBeNull();
  });
});
