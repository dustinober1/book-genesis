import test from "node:test";
import assert from "node:assert/strict";

import { buildSourceAudit, writeSourceAudit } from "../extensions/book-genesis/source-audit.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("source audit warns for unsupported nonfiction claims", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "prescriptive-nonfiction" });
    writeBasicManuscript(run);
    const report = buildSourceAudit(run);
    assert.equal(report.findings.some((finding) => finding.code === "unsupported_claims"), true);
    assert.match(writeSourceAudit(run).coveragePath, /source-coverage-map\.md$/);
  });
});

test("fiction source audit is optional by default", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "fiction" });
    writeBasicManuscript(run);
    assert.equal(buildSourceAudit(run).findings[0].severity, "info");
  });
});
