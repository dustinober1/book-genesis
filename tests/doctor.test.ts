import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildDoctorReport, formatDoctorReport } from "../extensions/book-genesis/doctor.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-doctor-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("buildDoctorReport reports a healthy package without errors", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({ bookMode: "fiction" }));

    const report = buildDoctorReport({
      workspaceRoot: workspace,
      packageRoot: process.cwd(),
      includeSiblingExtensions: false,
    });

    assert.equal(report.ok, true);
    assert.equal(report.results.some((result) => result.severity === "error"), false);
    assert.equal(report.results.some((result) => result.code === "config_valid"), true);
  });
});

test("buildDoctorReport reports invalid config as an error", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({ bookMode: "screenplay" }));

    const report = buildDoctorReport({
      workspaceRoot: workspace,
      packageRoot: process.cwd(),
      includeSiblingExtensions: false,
    });

    assert.equal(report.ok, false);
    assert.equal(report.results.some((result) => result.code === "config_invalid" && result.severity === "error"), true);
  });
});

test("buildDoctorReport warns about sibling extension dependency gaps", () => {
  withWorkspace((workspace) => {
    const parent = path.dirname(workspace);
    const sibling = path.join(parent, "seo-auto");
    mkdirSync(sibling, { recursive: true });
    writeFileSync(path.join(sibling, "package.json"), JSON.stringify({
      name: "seo-auto",
      dependencies: {
        picomatch: "^4.0.0",
      },
    }));

    const report = buildDoctorReport({
      workspaceRoot: workspace,
      packageRoot: process.cwd(),
      extensionsRoot: parent,
      includeSiblingExtensions: true,
    });

    assert.equal(report.results.some((result) => result.code === "sibling_dependency_missing"), true);
  });
});

test("formatDoctorReport includes actionable remedies", () => {
  const text = formatDoctorReport({
    ok: false,
    generatedAt: "2026-04-29T00:00:00.000Z",
    workspaceRoot: "/tmp/workspace",
    packageRoot: "/tmp/book-genesis",
    results: [{
      ok: false,
      severity: "error",
      code: "config_invalid",
      message: "Config is invalid.",
      remedy: "Fix book-genesis.config.json.",
    }],
  });

  assert.match(text, /Book Genesis doctor/);
  assert.match(text, /config_invalid/);
  assert.match(text, /Fix book-genesis\.config\.json/);
});
