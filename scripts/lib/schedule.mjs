// @ts-check
/**
 * Source of truth for scheduled jobs (engineering_spec §6). Times are America/Chicago.
 * GitHub Actions cron is UTC-only and has no DST, so each timed job gets TWO crons (one for CDT = UTC-5,
 * one for CST = UTC-6) and a guard step (`scripts/ct-guard.mjs`) lets only the one that lands on the
 * intended Chicago hour continue. The other exits immediately without installing anything.
 */

/**
 * @typedef {{
 *   name: string; npmScript: string; description: string;
 *   hour?: number; minute?: number;
 *   dow?: number;   // 0=Sunday .. 6=Saturday (weekly jobs)
 *   dom?: number;   // day of month (monthly jobs)
 *   hourly?: boolean;
 *   timeoutMinutes: number;
 *   secrets: string[];
 * }} JobSpec
 */

const DB = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
const MAIL = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "ADMIN_EMAIL",
  "UNSUBSCRIBE_SECRET",
  "NEXT_PUBLIC_APP_URL",
];
const EXTRACT = ["GROQ_API_KEY", "EMBEDDINGS_API_KEY"];

/** @type {JobSpec[]} */
export const JOBS = [
  {
    name: "sync-orgs",
    npmScript: "job:sync-orgs",
    description: "UTD Clubs directory -> orgs",
    hour: 2,
    dow: 0,
    timeoutMinutes: 20,
    secrets: [...DB, "NEBULA_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_EMAIL"],
  },
  {
    name: "expire-past",
    npmScript: "job:expire-past",
    description: "Mark finished competitions past, close Free Agency posts",
    hour: 3,
    timeoutMinutes: 10,
    secrets: [...DB, "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_EMAIL"],
  },
  {
    name: "ingest-instagram",
    npmScript: "job:ingest-instagram",
    description: "New Instagram posts -> listings",
    hour: 4,
    timeoutMinutes: 45,
    secrets: [
      ...DB,
      ...EXTRACT,
      ...MAIL,
      "META_IG_USER_ID",
      "META_LONG_LIVED_TOKEN",
      "APIFY_TOKEN",
    ],
  },
  {
    name: "ingest-feeds",
    npmScript: "job:ingest-feeds",
    description: "Devpost + MLH listings",
    hour: 5,
    timeoutMinutes: 30,
    secrets: [...DB, ...EXTRACT, ...MAIL],
  },
  {
    name: "ingest-events",
    npmScript: "job:ingest-events",
    description: "Campus calendar events -> competitions",
    hour: 5,
    minute: 30,
    timeoutMinutes: 30,
    secrets: [...DB, ...EXTRACT, ...MAIL, "NEBULA_API_KEY", "CAMPUSGROUPS_ICAL_URL"],
  },
  {
    name: "rededupe",
    npmScript: "job:rededupe",
    description: "Dedupe listings published while embeddings were down",
    hour: 6,
    timeoutMinutes: 15,
    secrets: [...DB, "EMBEDDINGS_API_KEY", "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_EMAIL"],
  },
  {
    name: "classify-accounts",
    npmScript: "job:classify-accounts",
    description: "Retest personal Instagram handles",
    hour: 3,
    minute: 30,
    dow: 6,
    timeoutMinutes: 30,
    secrets: [
      ...DB,
      "META_IG_USER_ID",
      "META_LONG_LIVED_TOKEN",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "ADMIN_EMAIL",
    ],
  },
  {
    name: "send-warnings",
    npmScript: "job:send-warnings",
    description: "Two-Minute Warning emails",
    hourly: true,
    timeoutMinutes: 10,
    secrets: [...DB, ...MAIL],
  },
  {
    name: "send-digest",
    npmScript: "job:send-digest",
    description: "Comet Arena Weekly digest",
    hour: 18,
    dow: 0,
    timeoutMinutes: 20,
    secrets: [...DB, ...MAIL],
  },
  {
    name: "refresh-token",
    npmScript: "job:refresh-token",
    description: "Refresh the Meta long-lived token",
    hour: 3,
    minute: 45,
    dom: 1,
    timeoutMinutes: 5,
    secrets: [
      "META_LONG_LIVED_TOKEN",
      "META_APP_ID",
      "META_APP_SECRET",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "ADMIN_EMAIL",
      "GH_SECRETS_TOKEN",
    ],
  },
];

/**
 * UTC cron expressions for a job (one for each Chicago offset).
 * @param {JobSpec} job
 * @returns {string[]}
 */
export function utcCrons(job) {
  if (job.hourly) return ["0 * * * *"];
  const minute = job.minute ?? 0;
  const out = [];
  for (const offset of [5, 6]) {
    const total = (job.hour ?? 0) + offset;
    const hour = total % 24;
    const dayShift = total >= 24 ? 1 : 0;
    const dow = job.dow === undefined ? "*" : String((job.dow + dayShift) % 7);
    // Monthly jobs: a +1 day shift would change the date, so use "day-of-month + shift" (our dom values are small).
    const dom = job.dom === undefined ? "*" : String(job.dom + dayShift);
    out.push(`${minute} ${hour} ${dom} * ${dow}`);
  }
  return out;
}

/**
 * Workflow file contents for one job.
 * @param {JobSpec} job
 */
export function renderWorkflow(job) {
  const crons = utcCrons(job);
  const guard = !job.hourly;
  const guardArgs = [
    `--hour ${job.hour}`,
    job.minute ? `--minute ${job.minute}` : "",
    job.dow !== undefined ? `--dow ${job.dow}` : "",
    job.dom !== undefined ? `--dom ${job.dom}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const gate = guard ? "\n        if: steps.guard.outputs.run == 'true'" : "";
  const secrets = job.secrets
    .map((/** @type {string} */ s) => `          ${s}: \${{ secrets.${s} }}`)
    .join("\n");
  return `# GENERATED by scripts/gen-workflows.mjs from scripts/lib/schedule.mjs. Do not edit by hand.
# ${job.description}. Schedule is America/Chicago${guard ? "; two UTC crons cover CDT and CST, the guard step lets only the correct one run" : ""}.
name: job-${job.name}

on:
  schedule:
${crons.map((c) => `    - cron: "${c}"`).join("\n")}
  workflow_dispatch:

# One run at a time per job; a late run finishes instead of being cancelled halfway.
concurrency:
  group: job-${job.name}
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: ${job.timeoutMinutes}
    steps:
      - uses: actions/checkout@v4${
        guard
          ? `
      - id: guard
        name: Only continue at the intended Chicago time
        run: node scripts/ct-guard.mjs ${guardArgs}
        env:
          EVENT_NAME: \${{ github.event_name }}`
          : ""
      }
      - uses: actions/setup-node@v4${gate}
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci${gate}
      - run: npm run ${job.npmScript}${gate}
        env:
          SOURCES_MODE: live
${secrets}
      - name: Flag the failure
        if: failure()
        run: echo "::error title=job-${job.name} failed::See the job log. The admin was also emailed if ADMIN_EMAIL is configured."
`;
}
