import test from "node:test";
import assert from "node:assert/strict";

import { approveRevisionPlan, createRevisionPlan, rejectRevisionPlan } from "../extensions/book-genesis/revision-plan.js";
import { makeRun, withWorkspace } from "./helpers.js";

test("feedback plan writes artifacts and approval launches revise", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    const plan = createRevisionPlan(run, "Fix the middle and clarify the ending.");
    assert.equal(plan.status, "pending");
    approveRevisionPlan(run);
    assert.equal(run.currentPhase, "revise");
    assert.equal(run.status, "running");
  });
});

test("rejecting revision plan records state without launching revise", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    createRevisionPlan(run, "Rewrite everything.");
    rejectRevisionPlan(run, "Too broad.");
    assert.equal(run.pendingRevisionPlan?.status, "rejected");
    assert.equal(run.status, "stopped");
  });
});
