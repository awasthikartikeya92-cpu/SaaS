import { describe, it, expect } from "vitest";
import { decideStageAction } from "./stage-decision";

describe("decideStageAction", () => {
  it("treats a successful prior run as already done", () => {
    expect(decideStageAction("success")).toBe("already-done");
  });

  it("treats a running prior run as in flight -- must not restart it", () => {
    // This is the specific race stageGate exists to prevent (see its
    // comment in orchestrator.ts): two overlapping step calls for the same
    // campaign both seeing "not done yet" and both trying to insert into a
    // uniquely-constrained table (offering_dna/icp_profiles/
    // signal_taxonomies). If this ever returned anything other than
    // "in-flight" for a "running" status, that race comes back.
    expect(decideStageAction("running")).toBe("in-flight");
  });

  it("treats an error status as not-started, not already-done", () => {
    // A stage's own run failing already flips the whole campaign to
    // "failed" in the same call (see runNextStep's catch block) before any
    // other caller can observe it -- but decideStageAction should never
    // treat "error" as a green light to skip the stage regardless, since
    // nothing about the campaign lifecycle should rely on that timing.
    //
    // This is also the exact mechanism POST /api/campaigns/[id]/retry
    // depends on to resume a failed campaign correctly: flipping the
    // campaign back to "generating" does nothing on its own to pick the
    // right stage back up -- it's this function returning "not-started"
    // for the one stage whose last run errored (while every earlier stage,
    // still "success", stays "already-done") that makes runNextStep()
    // re-run only the failed stage instead of everything from scratch.
    expect(decideStageAction("error")).toBe("not-started");
  });

  it("treats no prior run (undefined) as not-started", () => {
    expect(decideStageAction(undefined)).toBe("not-started");
  });

  it("treats an unrecognized status as not-started, not as done", () => {
    // Defensive default: an unexpected value should never be silently
    // treated as "safe to skip" -- that direction of mistake (skipping
    // real work) is worse than the other (re-attempting something already
    // done, which stageGate's caller handles safely either way).
    expect(decideStageAction("something-unexpected")).toBe("not-started");
  });
});
