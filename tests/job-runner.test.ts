import type { MailMessage } from "@/lib/sources";
import { describe, expect, it, vi } from "vitest";
import { memoryCursorStore, runJob } from "@/lib/jobs/runner";

const mk = () => {
  const lines: string[] = [];
  const send = vi.fn(async (_m: MailMessage) => ({ id: "m1" }));
  return {
    lines,
    send,
    deps: {
      cursors: memoryCursorStore(),
      mailer: { send },
      adminEmail: "admin@example.com",
      write: (l: string) => lines.push(l),
      now: () => 1_700_000_000_000,
    },
  };
};

describe("runJob", () => {
  it("logs start and done as JSON lines and returns the summary", async () => {
    const { lines, deps } = mk();
    const r = await runJob("demo", async () => ({ processed: 3 }), deps);
    expect(r).toMatchObject({ ok: true, resumed: false, summary: { processed: 3 } });
    expect(lines.map((l) => JSON.parse(l).event)).toEqual(["start", "done"]);
    expect(JSON.parse(lines[1])).toMatchObject({ job: "demo", processed: 3 });
  });

  it("a failing job emails the admin, returns ok=false and keeps its cursor", async () => {
    const { deps, send } = mk();
    const r = await runJob<number>(
      "demo",
      async (ctx) => {
        await ctx.checkpoint(7);
        throw new Error("boom <b>");
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, error: "boom <b>" });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe("admin@example.com");
    expect(msg.subject).toContain("demo");
    expect(msg.html).not.toContain("<b>"); // escaped
    expect(deps.cursors.data.get("demo")).toBe(7);
  });

  it("a rerun resumes from the checkpoint and clears it on success", async () => {
    const { deps } = mk();
    await runJob<number>(
      "demo",
      async (ctx) => {
        await ctx.checkpoint(5);
        throw new Error("x");
      },
      deps,
    );
    let seen: number | null = null;
    const r = await runJob<number>(
      "demo",
      async (ctx) => {
        seen = ctx.cursor;
      },
      deps,
    );
    expect(seen).toBe(5);
    expect(r.resumed).toBe(true);
    expect(deps.cursors.data.has("demo")).toBe(false);
  });

  it("failure emails are idempotent per job per day and a mail outage does not mask the failure", async () => {
    const { deps, send } = mk();
    await runJob(
      "demo",
      async () => {
        throw new Error("a");
      },
      deps,
    );
    expect(send.mock.calls[0][0].idempotencyKey).toBe("job-failed:demo:2023-11-14");
    send.mockRejectedValueOnce(new Error("resend down"));
    const r = await runJob(
      "demo",
      async () => {
        throw new Error("b");
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, error: "b" });
  });

  it("without a mailer or admin address it still fails cleanly", async () => {
    const { lines, deps } = mk();
    const r = await runJob(
      "demo",
      async () => {
        throw new Error("c");
      },
      { ...deps, mailer: undefined },
    );
    expect(r.ok).toBe(false);
    expect(lines.some((l) => JSON.parse(l).event === "admin_not_notified")).toBe(true);
  });

  it("a broken cursor store does not stop the job", async () => {
    const { deps } = mk();
    const cursors = {
      get: async () => {
        throw new Error("db");
      },
      set: async () => {
        throw new Error("db");
      },
      clear: async () => {
        throw new Error("db");
      },
    };
    const r = await runJob(
      "demo",
      async (ctx) => {
        await ctx.checkpoint(1);
        return { ok: 1 };
      },
      { ...deps, cursors },
    );
    expect(r.ok).toBe(true);
  });
});
