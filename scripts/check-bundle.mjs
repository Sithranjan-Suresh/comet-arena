// @ts-check
// Fails if anything that must stay server-side appears in the client bundle (.next/static) or the
// public folder. Run after `next build`:  npm run check:bundle
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Names of secrets (see .env.example). Their VALUES are also searched for when set in the environment. */
const SECRET_NAMES = [
  "SUPABASE_SERVICE_KEY",
  "GROQ_API_KEY",
  "EMBEDDINGS_API_KEY",
  "RESEND_API_KEY",
  "UNSUBSCRIBE_SECRET",
  "EXTRACT_INTERNAL_KEY",
  "META_LONG_LIVED_TOKEN",
  "META_APP_SECRET",
  "APIFY_TOKEN",
  "NEBULA_API_KEY",
  "GH_SECRETS_TOKEN",
];
/** Shapes of real credentials, whatever their variable name. */
const PATTERNS = [
  [/service_role/, "Supabase service_role marker"],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/gsk_[A-Za-z0-9]{20,}/, "Groq API key"],
  [/re_[A-Za-z0-9]{20,}/, "Resend API key"],
  [/ghp_[A-Za-z0-9]{30,}/, "GitHub token"],
  [
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    "JWT (service keys are JWTs; the anon key is allowed below)",
  ],
];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const roots = [".next/static", "public"];
const files = roots.flatMap(walk).filter((f) => /\.(js|css|html|json|map|txt)$/.test(f));
if (files.length === 0) {
  console.error("No build output found. Run `npm run build` first.");
  process.exit(2);
}

const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const values = SECRET_NAMES.map((n) => [n, process.env[n]]).filter(
  ([, v]) => v && String(v).length >= 8,
);
const problems = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const n of SECRET_NAMES) if (text.includes(n)) problems.push(`${f}: mentions ${n}`);
  for (const [n, v] of values)
    if (text.includes(String(v))) problems.push(`${f}: contains the value of ${n}`);
  for (const [re, label] of PATTERNS) {
    const m = text.match(re);
    if (m && !(anon && m[0] === anon)) problems.push(`${f}: looks like a ${label}`);
  }
}
if (problems.length) {
  console.error("Client bundle leak check FAILED:\n" + problems.map((p) => " - " + p).join("\n"));
  process.exit(1);
}
console.log(`Client bundle clean (${files.length} files scanned).`);
