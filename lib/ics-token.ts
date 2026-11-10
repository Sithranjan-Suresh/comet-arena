import "server-only";
import { randomBytes } from "node:crypto";

/** 24 random bytes as hex (192 bits). Matches the DB default `encode(gen_random_bytes(24), 'hex')`. */
export function generateIcsToken(): string {
  return randomBytes(24).toString("hex");
}
