import { SourceError } from "../errors";
import type { Mailer } from "../types";

export interface ResendOptions {
  apiKey: string;
  /** Verified sender, e.g. "Comet Arena <alerts@mail.example.com>". */
  from: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Resend over its REST API. `Idempotency-Key` makes a retried request deliver at most one email, which
 * is what guarantees "no duplicate warnings for the same stage and window" even when a job re-runs.
 */
export function createResendMailer(opts: ResendOptions): Mailer {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const doFetch = opts.fetchImpl ?? fetch;
  const name = "resend";

  return {
    async send(msg) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            "content-type": "application/json",
            ...(msg.idempotencyKey ? { "idempotency-key": msg.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: opts.from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            ...(msg.headers ? { headers: msg.headers } : {}),
          }),
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) throw new SourceError(name, "timeout");
        throw new SourceError(
          name,
          "unavailable",
          `${name}: network error (${(e as Error).message})`,
        );
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        throw new SourceError(
          name,
          "rate_limit",
          undefined,
          Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000,
        );
      }
      if (res.status === 422 || res.status === 400)
        throw new SourceError(name, "malformed", `${name}: rejected (${res.status})`);
      if (!res.ok) throw new SourceError(name, "unavailable", `${name}: HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      if (!body?.id) throw new SourceError(name, "malformed", `${name}: no message id in response`);
      return { id: body.id };
    },
  };
}
