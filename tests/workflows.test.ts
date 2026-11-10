import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { load as yamlLoad } from "js-yaml";
import { describe, expect, it } from "vitest";
import { chicagoParts, shouldRun } from "../scripts/ct-guard.mjs";
import { JOBS, utcCrons } from "../scripts/lib/schedule.mjs";

type Job = (typeof JOBS)[number];
const job = (n: string): Job => JOBS.find((j: Job) => j.name === n)!;
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const files = readdirSync(".github/workflows").filter((f) => f.startsWith("job-"));
const load = (f: string) =>
  yamlLoad(readFileSync(`.github/workflows/${f}`, "utf8")) as {
    on: { schedule: { cron: string }[] };
    concurrency: { group: string; "cancel-in-progress": boolean };
    jobs: {
      run: {
        steps: { run?: string; uses?: string; if?: string; env?: Record<string, string> }[];
        "timeout-minutes": number;
      };
    };
  };

describe("job schedules match engineering_spec §6 (America/Chicago)", () => {
  it("daily jobs: UTC crons for CDT (UTC-5) and CST (UTC-6)", () => {
    expect(utcCrons(job("expire-past"))).toEqual(["0 8 * * *", "0 9 * * *"]); // 3 AM CT
    expect(utcCrons(job("ingest-instagram"))).toEqual(["0 9 * * *", "0 10 * * *"]); // 4 AM
    expect(utcCrons(job("ingest-feeds"))).toEqual(["0 10 * * *", "0 11 * * *"]); // 5 AM
  });
  it("weekly jobs and day rollover: Sun 2 AM and Sun 6 PM CT", () => {
    expect(utcCrons(job("sync-orgs"))).toEqual(["0 7 * * 0", "0 8 * * 0"]);
    expect(utcCrons(job("send-digest"))).toEqual(["0 23 * * 0", "0 0 * * 1"]); // CST lands on Monday UTC
  });
  it("send-warnings runs hourly with no guard", () => {
    expect(utcCrons(job("send-warnings"))).toEqual(["0 * * * *"]);
    expect(readFileSync(".github/workflows/job-send-warnings.yml", "utf8")).not.toContain(
      "ct-guard",
    );
  });
});

describe("DST guard", () => {
  const at = (iso: string) => new Date(iso);
  it("summer (CDT): 09:00Z is 4 AM Chicago, 10:00Z is 5 AM", () => {
    expect(chicagoParts(at("2027-07-15T09:00:00Z")).hour).toBe(4);
    expect(shouldRun(at("2027-07-15T09:00:00Z"), { hour: 4 })).toBe(true);
    expect(shouldRun(at("2027-07-15T10:00:00Z"), { hour: 4 })).toBe(false); // the CST cron's slot is skipped
  });
  it("winter (CST): 10:00Z is 4 AM Chicago, 09:00Z is 3 AM", () => {
    expect(shouldRun(at("2027-01-15T10:00:00Z"), { hour: 4 })).toBe(true);
    expect(shouldRun(at("2027-01-15T09:00:00Z"), { hour: 4 })).toBe(false);
  });
  it("exactly one of the two crons runs on both sides of both DST changes", () => {
    for (const day of [
      "2027-03-13",
      "2027-03-14",
      "2027-03-15",
      "2027-11-06",
      "2027-11-07",
      "2027-11-08",
    ]) {
      const runs = utcCrons(job("ingest-instagram")).filter((c) =>
        shouldRun(at(`${day}T${c.split(" ")[1].padStart(2, "0")}:00:00Z`), { hour: 4 }),
      );
      expect(runs, day).toHaveLength(1);
    }
  });
  it("weekly guard checks the Chicago weekday (Sunday 6 PM CST is Monday UTC)", () => {
    expect(shouldRun(at("2027-01-18T00:00:00Z"), { hour: 18, dow: 0 })).toBe(true); // Mon 00:00Z = Sun 6 PM CST
    expect(shouldRun(at("2027-01-18T01:00:00Z"), { hour: 18, dow: 0 })).toBe(false);
  });
  it("monthly guard checks the Chicago day of month", () => {
    expect(shouldRun(at("2027-08-01T08:45:00Z"), { hour: 3, dom: 1 })).toBe(true);
    expect(shouldRun(at("2027-08-02T08:45:00Z"), { hour: 3, dom: 1 })).toBe(false);
  });
});

describe("generated workflows", () => {
  it("are up to date with the schedule table", () => {
    expect(() =>
      execFileSync("node", ["scripts/gen-workflows.mjs", "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });
  it("one workflow per job, valid YAML, crons match the table", () => {
    expect(files.sort()).toEqual(JOBS.map((j: Job) => `job-${j.name}.yml`).sort());
    for (const j of JOBS as Job[]) {
      const w = load(`job-${j.name}.yml`);
      expect(w.on.schedule.map((s) => s.cron)).toEqual(utcCrons(j));
    }
  });
  it("each job has its own non-cancelling concurrency group and a timeout", () => {
    const groups = new Set<string>();
    for (const f of files) {
      const w = load(f);
      expect(w.concurrency["cancel-in-progress"]).toBe(false);
      expect(w.jobs.run["timeout-minutes"]).toBeGreaterThan(0);
      groups.add(w.concurrency.group);
    }
    expect(groups.size).toBe(files.length);
  });
  it("run a real npm script in live mode, with secrets from GitHub, and flag failures", () => {
    for (const j of JOBS as Job[]) {
      expect(pkg.scripts[j.npmScript], j.npmScript).toBeTruthy();
      const text = readFileSync(`.github/workflows/job-${j.name}.yml`, "utf8");
      expect(text).toContain(`npm run ${j.npmScript}`);
      expect(text).toContain("SOURCES_MODE: live");
      for (const s of j.secrets) expect(text).toContain(`${s}: \${{ secrets.${s} }}`);
      expect(text).toContain("if: failure()");
    }
  });
  it("secrets are never echoed and scripts tolerate a missing .env.local in CI", () => {
    for (const k of Object.keys(pkg.scripts).filter((k) => k.startsWith("job:")))
      expect(pkg.scripts[k]).toContain("--env-file-if-exists");
  });
});
