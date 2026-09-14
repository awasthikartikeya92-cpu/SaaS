/**
 * Pure decision logic for whether a shared-stage step (offering/icp/signal/
 * research) should run now, is already done, or is already in flight
 * elsewhere. Pulled out of orchestrator.ts into its own file specifically
 * so it's testable without a live Postgres connection -- orchestrator.ts
 * imports `db` at module scope (see src/lib/db/index.ts), which throws
 * immediately without a real connection string, so nothing in that file
 * can be imported in a test environment. This one decision -- arguably the
 * most important to get right, since it's what stands between a harmless
 * race and an incorrectly-failed campaign (see stageGate's comment in
 * orchestrator.ts) -- doesn't have to be untestable along with it.
 */
export type StageDecision = "already-done" | "in-flight" | "not-started";

export function decideStageAction(existingRunStatus: string | undefined): StageDecision {
  if (existingRunStatus === "success") return "already-done";
  if (existingRunStatus === "running") return "in-flight";
  return "not-started";
}
