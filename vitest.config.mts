import { defineConfig } from "vitest/config";

// Deliberately minimal -- the first test suite in this project targets the
// pure, deterministic core (scoring, JSON parsing, verification), none of
// which needs the "@/*" path alias or any Next.js-specific config, so
// there's no plugin dependency to add for that. See docs/launch-checklist.md
// for what's tested and why, and what's intentionally NOT (anything that
// needs a live Postgres connection -- unreachable from this sandbox, same
// restriction noted throughout the codebase).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
