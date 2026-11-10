import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  pages: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string(),
      url: z.string().url(),
      host: z.string(),
    }),
  ),
  senders: z.array(z.string().min(3)),
});
export type DeptConfig = z.infer<typeof configSchema>;

/** config/dept-sources.json, validated. `INBOUND_SENDERS` (comma-separated) adds allowed senders without a deploy. */
export function loadDeptConfig(extraSenders = process.env.INBOUND_SENDERS): DeptConfig {
  const cfg = configSchema.parse(
    JSON.parse(readFileSync(path.resolve(process.cwd(), "config/dept-sources.json"), "utf8")),
  );
  const extra = (extraSenders ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...cfg, senders: [...new Set([...cfg.senders, ...extra])] };
}
