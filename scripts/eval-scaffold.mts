// Start a new eval case from an Instagram post URL. Writes a draft line you finish by hand.
//   npm run eval:scaffold -- https://www.instagram.com/p/XXXX/ --org ais [--handle ais_utd] [--caption "..."]
// With --handle and SOURCES_MODE=live it looks the post up through Business Discovery to prefill caption,
// date and image URLs. Image URLs expire, so DOWNLOAD the images into eval/images/ and list those paths.
import { appendFileSync, mkdirSync } from "node:fs";
import { getSources } from "../lib/sources";

const args = process.argv.slice(2);
const flag = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = args.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error(
    "Usage: eval:scaffold <instagram post url> --org <club slug> [--handle h] [--caption text]",
  );
  process.exit(2);
}
const shortcode = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1];
if (!shortcode) {
  console.error("That does not look like an Instagram post URL (expected /p/<code>/).");
  process.exit(2);
}

let caption = flag("caption") ?? "";
let posted = new Date().toISOString();
let imageUrls: string[] = [];
const handle = flag("handle");
if (handle) {
  const res = await getSources().instagram.fetchRecentPosts(handle, { limit: 25 });
  const hit =
    res.status === "ok" ? res.posts.find((p) => p.permalink.includes(shortcode)) : undefined;
  if (hit) {
    caption = caption || hit.caption || "";
    posted = hit.postedAt;
    imageUrls = hit.mediaUrls;
  } else console.warn("Post not found in the account's recent posts; fill the fields by hand.");
}

const draft = {
  id: `${(flag("org") ?? "org").toLowerCase()}-${shortcode.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  source_url: url,
  org: flag("org") ?? "FILL_ME",
  posted_at: posted,
  caption,
  images: [] as string[],
  label: {
    kind: "FILL_ME",
    title: null,
    host: null,
    categories: [],
    first_deadline: null,
    register_url: null,
  },
  notes: imageUrls.length ? `Download these into eval/images/: ${imageUrls.join(" ")}` : "",
};
mkdirSync("eval", { recursive: true });
appendFileSync("eval/cases.draft.jsonl", JSON.stringify(draft) + "\n");
console.log(
  `Appended a draft to eval/cases.draft.jsonl (${draft.id}). Finish the label, save images under eval/images/, then move the line into eval/cases.jsonl.`,
);
