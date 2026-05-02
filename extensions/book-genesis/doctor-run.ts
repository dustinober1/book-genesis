import { existsSync } from "node:fs";
import path from "node:path";

import { validatePhaseArtifacts } from "./artifacts.js";
import { buildFinalCheck } from "./final-check.js";
import { buildSourcePack, sourcePackExists } from "./source-pack.js";
import type { HealthCheckResult, PhaseName, RunState } from "./types.js";

function result(ok: boolean, severity: HealthCheckResult["severity"], code: string, message: string, remedy?: string): HealthCheckResult {
  return { ok, severity, code, message, remedy };
}

export function buildRunDoctorReport(run: RunState) {
  const results: HealthCheckResult[] = [
    result(true, "info", "state_readable", `Run state is readable for ${run.id}.`),
    existsSync(run.rootDir)
      ? result(true, "info", "run_root_present", `Run root exists: ${run.rootDir}.`)
      : result(false, "error", "run_root_missing", `Run root is missing: ${run.rootDir}.`),
    existsSync(run.ledgerPath)
      ? result(true, "info", "ledger_present", "Run ledger is present.")
      : result(false, "warning", "ledger_missing", "Run ledger is missing.", "Resume the run or record a source/decision to recreate the ledger."),
  ];

  const phases = Array.from(new Set([...run.completedPhases, run.currentPhase])) as PhaseName[];
  for (const phase of phases) {
    const validation = validatePhaseArtifacts(run, phase, run.artifacts[phase] ?? []);
    for (const issue of validation.issues.slice(0, 5)) {
      results.push(result(false, "warning", `artifact_${issue.code}`, `${phase}: ${issue.target} - ${issue.message}`, "Run /book-genesis audit for the full artifact report."));
    }
  }

  const sourcePack = buildSourcePack(run);
  if (sourcePack.required && !sourcePackExists(run)) {
    results.push(result(false, "error", "source_pack_missing", "Required source-pack artifact is missing.", "Run /book-genesis source-pack."));
  }

  const finalCheck = buildFinalCheck(run);
  if (!finalCheck.ok) {
    results.push(result(false, "error", "final_check_blocked", "Final-check currently has release blockers.", "Run /book-genesis final-check."));
  }

  const staleTargets = [
    path.join(run.rootDir, "dashboard", "run-dashboard.json"),
    path.join(run.rootDir, "dashboard", "workbench.json"),
    path.join(run.rootDir, "delivery", "final-check.json"),
  ].filter((target) => !existsSync(target));
  for (const target of staleTargets) {
    const command = target.endsWith("workbench.json")
      ? "Run /book-genesis workbench."
      : "Run /book-genesis dashboard or /book-genesis final-check.";
    results.push(result(false, "info", "report_missing", `Report has not been generated yet: ${target}`, command));
  }

  return {
    ok: results.every((item) => item.severity !== "error"),
    generatedAt: new Date().toISOString(),
    runId: run.id,
    results,
  };
}

export function formatRunDoctorReport(report: ReturnType<typeof buildRunDoctorReport>) {
  return [
    `# Book Genesis run doctor for ${report.runId}`,
    "",
    `- Status: ${report.ok ? "OK" : "NEEDS ATTENTION"}`,
    "",
    ...report.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}${item.remedy ? ` Remedy: ${item.remedy}` : ""}`),
    "",
  ].join("\n");
}
