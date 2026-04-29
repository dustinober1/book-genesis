import path from "node:path";

import type { RunState } from "./types.js";
import { ensureDir, writeMarkdown } from "./run-files.js";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function createRevisionPlan(run: RunState, feedback: string) {
  if (!feedback.trim()) {
    throw new Error("Reviewer feedback is required.");
  }
  const dir = ensureDir(path.join(run.rootDir, "evaluations", "revision-plans"));
  const feedbackPath = writeMarkdown(path.join(dir, `${stamp()}-feedback.md`), feedback.trim());
  const planPath = writeMarkdown(path.join(run.rootDir, "evaluations", "revision-plan.md"), [
    "# Revision Plan",
    "",
    "## Feedback",
    feedback.trim(),
    "",
    "## Plan",
    "- Identify affected chapters and continuity dependencies.",
    "- Prioritize structural fixes before line edits.",
    "- Re-run evaluation, style lint, scene map, and source audit after revision.",
  ].join("\n"));
  writeMarkdown(path.join(run.rootDir, "evaluations", "change-impact-map.md"), "# Change Impact Map\n\n- Map each requested change to affected chapters before rewriting.\n");
  writeMarkdown(path.join(run.rootDir, "evaluations", "revision-risk-register.md"), "# Revision Risk Register\n\n- Watch for continuity drift, scope creep, and new unsupported claims.\n");
  run.pendingRevisionPlan = { requestedAt: new Date().toISOString(), feedbackPath, planPath, status: "pending" };
  run.status = run.config.revisionPlan.approvalRequired ? "awaiting_approval" : run.status;
  run.nextAction = "Approve or reject the pending revision plan.";
  return run.pendingRevisionPlan;
}

export function approveRevisionPlan(run: RunState) {
  if (!run.pendingRevisionPlan || run.pendingRevisionPlan.status !== "pending") {
    throw new Error("No pending revision plan to approve.");
  }
  run.pendingRevisionPlan.status = "approved";
  run.currentPhase = "revise";
  run.status = "running";
  run.nextAction = `Revise using approved plan: ${run.pendingRevisionPlan.planPath}`;
  return run.pendingRevisionPlan;
}

export function rejectRevisionPlan(run: RunState, note = "") {
  if (!run.pendingRevisionPlan || run.pendingRevisionPlan.status !== "pending") {
    throw new Error("No pending revision plan to reject.");
  }
  run.pendingRevisionPlan.status = "rejected";
  run.pendingRevisionPlan.note = note.trim() || undefined;
  run.status = "stopped";
  run.stopRequested = true;
  run.nextAction = note.trim() || "Revision plan rejected.";
  return run.pendingRevisionPlan;
}
