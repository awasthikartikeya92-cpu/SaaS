import { defineConfig } from "vitest/config";
import path from "node:path";

// import.meta.dirname (Node 20.11+/21.2+, well within this project's Node
// 22 baseline -- see .github/workflows/ci.yml), not __dirname: this file
// is loaded as native ESM, where __dirname doesn't exist at all outside a
// CommonJS wrapper.
const here = import.meta.dirname;

// The first test suite in this project targeted the pure, deterministic
// core (scoring, JSON parsing, verification) via relative imports only, so
// no alias config was needed. The prompt-caching tests import
// contact-agent.ts/gtm-agent.ts directly, and those files use the "@/*"
// alias internally (import ... from "@/lib/ai") the same way the rest of
// the app does -- resolving it here, matching tsconfig.json's paths
// mapping, is what lets them import without either rewriting those
// agents' own imports just for tests or duplicating them. Still no
// Next.js-specific plugin/config: nothing here needs one. See
// docs/launch-checklist.md for what's tested and why, and what's
// intentionally NOT (anything that needs a live Postgres connection --
// unreachable from this sandbox, same restriction noted throughout the
// codebase).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(here, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
