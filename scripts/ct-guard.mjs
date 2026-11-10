// @ts-check
// Exit-0 guard for DST-safe scheduling: writes run=true|false to $GITHUB_OUTPUT.
//   node scripts/ct-guard.mjs --hour 4 [--minute 0] [--dow 0] [--dom 1]
// Manual (workflow_dispatch) runs always continue.
import { appendFileSync } from "node:fs";

/** Chicago wall-clock parts for an instant. */
export function chicagoParts(/** @type {Date} */ d) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hourCycle: "h23",
      weekday: "short",
      day: "numeric",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    hour: Number(parts.hour),
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    dom: Number(parts.day),
  };
}

/** Should a run at `now` proceed for this schedule? */
export function shouldRun(
  /** @type {Date} */ now,
  /** @type {{hour:number; dow?:number; dom?:number}} */ want,
) {
  const c = chicagoParts(now);
  return (
    c.hour === want.hour &&
    (want.dow === undefined || c.dow === want.dow) &&
    (want.dom === undefined || c.dom === want.dom)
  );
}

if (process.argv[1] && process.argv[1].endsWith("ct-guard.mjs")) {
  const arg = (/** @type {string} */ k) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? Number(process.argv[i + 1]) : undefined;
  };
  const manual = process.env.EVENT_NAME === "workflow_dispatch";
  const run =
    manual ||
    shouldRun(new Date(), {
      hour: /** @type {number} */ (arg("hour")),
      dow: arg("dow"),
      dom: arg("dom"),
    });
  const line = `run=${run}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  console.log(line.trim(), manual ? "(manual run)" : "");
}
