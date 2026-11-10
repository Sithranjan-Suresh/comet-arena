import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/check-bundle.mjs");

function run(files: Record<string, string>, env: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "bundle-"));
  for (const [name, text] of Object.entries(files)) {
    const f = path.join(dir, name);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, text);
  }
  const r = spawnSync("node", [script], {
    cwd: dir,
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env } as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

describe("client bundle leak check", () => {
  it("passes a clean bundle", () => {
    expect(run({ ".next/static/a.js": "console.log('hello')" }).code).toBe(0);
  });
  it("fails when a secret variable name or a service_role marker is in the bundle", () => {
    expect(run({ ".next/static/a.js": "process.env.SUPABASE_SERVICE_KEY" }).code).toBe(1);
    expect(run({ ".next/static/a.js": 'role:"service_role"' }).out).toContain("service_role");
  });
  it("fails when the VALUE of a configured secret appears, whatever it is called", () => {
    const r = run(
      { ".next/static/a.js": 'const k="hunter2-very-secret"' },
      { GROQ_API_KEY: "hunter2-very-secret" },
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain("value of GROQ_API_KEY");
  });
  it("fails on credential-shaped strings and finds them in public/ too", () => {
    expect(run({ "public/x.txt": "gsk_" + "a".repeat(30) }).code).toBe(1);
    expect(run({ ".next/static/a.js": "ghp_" + "b".repeat(36) }).code).toBe(1);
  });
  it("allows the public anon key (it is meant to ship to browsers)", () => {
    const anon = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl";
    expect(
      run({ ".next/static/a.js": `k="${anon}"` }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: anon }).code,
    ).toBe(0);
    expect(run({ ".next/static/a.js": `k="${anon}"` }).code).toBe(1); // unknown JWT: refuse
  });
  it("errors out (exit 2) when there is no build output to check", () => {
    expect(run({ "README.txt": "x" }).code).toBe(2);
  });
});
