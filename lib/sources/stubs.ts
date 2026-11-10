import { SourceError } from "./errors";

/**
 * Placeholder adapter whose every method throws a clear "not implemented yet" error that names the
 * task that delivers it. Replaced as the real mock/live adapters land (Tasks 38-47, 66, 93-97).
 */
export function notImplemented<T extends object>(source: string, task: string): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      if (prop === "then") return undefined; // keep it awaitable-safe
      return () => {
        throw new SourceError(
          source,
          "not_implemented",
          `${source}.${String(prop)} is implemented in ${task}`,
        );
      };
    },
  });
}
