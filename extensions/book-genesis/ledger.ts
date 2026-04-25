import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { DecisionLedgerEntry, PhaseName, RunLedger, RunState, SourceLedgerEntry } from "./types.js";
import { ensureRunDirectories } from "./state.js";

function nowIso() {
  return new Date().toISOString();
}

function emptyLedger(): RunLedger {
  return { sources: [], decisions: [] };
}

export function readLedger(run: RunState): RunLedger {
  if (!existsSync(run.ledgerPath)) {
    return emptyLedger();
  }

  return JSON.parse(readFileSync(run.ledgerPath, "utf8")) as RunLedger;
}

function writeLedger(run: RunState, ledger: RunLedger) {
  ensureRunDirectories(run.rootDir);
  writeFileSync(run.ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

export function recordSource(
  run: RunState,
  entry: Omit<SourceLedgerEntry, "recordedAt"> & { phase: PhaseName },
) {
  const ledger = readLedger(run);
  ledger.sources.push({ ...entry, recordedAt: nowIso() });
  writeLedger(run, ledger);
}

export function recordDecision(
  run: RunState,
  entry: Omit<DecisionLedgerEntry, "recordedAt"> & { phase: PhaseName },
) {
  const ledger = readLedger(run);
  ledger.decisions.push({ ...entry, recordedAt: nowIso() });
  writeLedger(run, ledger);
}

