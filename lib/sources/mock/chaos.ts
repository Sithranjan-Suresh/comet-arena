import { SourceError } from "../errors";

export type Outcome = "ok" | "malformed" | "timeout" | "rate_limit";

export interface ChaosOptions {
  /** Seed for the deterministic PRNG so tests and demos are reproducible. */
  seed?: number;
  /** Simulated latency range in ms (spec: 1-4 s). */
  latencyMs?: [number, number];
  /** Share of calls that return malformed output (spec: 10%). */
  malformedRate?: number;
  /** Share of calls that time out (spec: 5%). */
  timeoutRate?: number;
  /** Which call number (1-based) returns a single 429 per run; 0 disables (spec: one 429). */
  rateLimitAtCall?: number;
  /** Force every call to this outcome (tests / demo fallbacks). */
  force?: Outcome;
  /** Injectable sleep so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** mulberry32: tiny seedable PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Chaos {
  private rand: () => number;
  private calls = 0;
  readonly opts: Required<Omit<ChaosOptions, "force">> & { force?: Outcome };

  constructor(options: ChaosOptions = {}) {
    this.opts = {
      seed: options.seed ?? 20261110,
      latencyMs: options.latencyMs ?? [1000, 4000],
      malformedRate: options.malformedRate ?? 0.1,
      timeoutRate: options.timeoutRate ?? 0.05,
      rateLimitAtCall: options.rateLimitAtCall ?? 7,
      sleep: options.sleep ?? realSleep,
      force: options.force,
    };
    this.rand = prng(this.opts.seed);
  }

  /**
   * Env-driven defaults for `SOURCES_MODE=mock`:
   *   MOCK_CHAOS=off  -> no injected failures
   *   MOCK_FAST=1     -> no artificial latency
   */
  static fromEnv(env: Record<string, string | undefined> = process.env): Chaos {
    const off = env.MOCK_CHAOS === "off";
    const fast = env.MOCK_FAST === "1";
    return new Chaos({
      latencyMs: fast ? [0, 0] : undefined,
      malformedRate: off ? 0 : undefined,
      timeoutRate: off ? 0 : undefined,
      rateLimitAtCall: off ? 0 : undefined,
    });
  }

  /** A chaos instance that never fails and never waits (default for unit tests of other modules). */
  static none(): Chaos {
    return new Chaos({
      latencyMs: [0, 0],
      malformedRate: 0,
      timeoutRate: 0,
      rateLimitAtCall: 0,
      sleep: async () => {},
    });
  }

  get callCount(): number {
    return this.calls;
  }

  /** Simulate latency, then decide this call's outcome. */
  async roll(): Promise<Outcome> {
    this.calls++;
    const [lo, hi] = this.opts.latencyMs;
    const wait = lo + this.rand() * Math.max(0, hi - lo);
    if (wait > 0) await this.opts.sleep(Math.round(wait));

    if (this.opts.force) return this.opts.force;
    const r = this.rand(); // always consume so outcomes are stable regardless of rate settings
    if (this.opts.rateLimitAtCall > 0 && this.calls === this.opts.rateLimitAtCall)
      return "rate_limit";
    if (r < this.opts.timeoutRate) return "timeout";
    if (r < this.opts.timeoutRate + this.opts.malformedRate) return "malformed";
    return "ok";
  }

  /** For adapters whose "malformed" outcome should throw (non-LLM sources). Returns when ok. */
  async guard(source: string): Promise<void> {
    const outcome = await this.roll();
    throwForOutcome(source, outcome);
  }
}

/** timeout and rate_limit become typed errors; malformed is left to the caller. */
export function throwForOutcome(source: string, outcome: Outcome): void {
  if (outcome === "timeout")
    throw new SourceError(source, "timeout", `${source}: simulated timeout`);
  if (outcome === "rate_limit") {
    throw new SourceError(source, "rate_limit", `${source}: simulated 429`, 1000);
  }
  if (outcome === "malformed")
    throw new SourceError(source, "malformed", `${source}: simulated malformed response`);
}
