import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}", "lib/**/*.test.ts", "components/**/*.test.tsx"],
    environment: "node", // component tests opt in with `// @vitest-environment jsdom`
    setupFiles: ["./tests/setup.ts"],
  },
});
