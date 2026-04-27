import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { ensureWorkspaceGitRepo, snapshotRunProgress } from "../extensions/book-genesis/git.js";
import { createRunState, writeRunState } from "../extensions/book-genesis/state.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("ensureWorkspaceGitRepo initializes a repository when none exists", () => {
  withWorkspace((workspace) => {
    const result = ensureWorkspaceGitRepo(workspace, DEFAULT_RUN_CONFIG);

    assert.equal(result.initialized, true);
    assert.equal(result.enabled, true);
    assert.match(
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: workspace, encoding: "utf8" }),
      /true/,
    );
  });
});

test("snapshotRunProgress creates a commit when tracked paths changed", () => {
  withWorkspace((workspace) => {
    const gitStatus = ensureWorkspaceGitRepo(workspace, DEFAULT_RUN_CONFIG);
    const run = createRunState(workspace, "literary thriller", DEFAULT_RUN_CONFIG);
    run.git = { repoRoot: gitStatus.repoRoot, initializedByRuntime: gitStatus.initialized };
    writeRunState(run);

    const result = snapshotRunProgress(run, "kickoff", DEFAULT_RUN_CONFIG.gitCommitPaths);
    assert.equal(result.createdCommit, true);
    assert.match(result.commitMessage ?? "", /\[book-genesis:kickoff\]/);
  });
});

test("snapshotRunProgress creates one commit per changed file", () => {
  withWorkspace((workspace) => {
    const gitStatus = ensureWorkspaceGitRepo(workspace, DEFAULT_RUN_CONFIG);
    const run = createRunState(workspace, "literary thriller", DEFAULT_RUN_CONFIG);
    run.git = { repoRoot: gitStatus.repoRoot, initializedByRuntime: gitStatus.initialized };
    writeRunState(run);

    snapshotRunProgress(run, "kickoff", DEFAULT_RUN_CONFIG.gitCommitPaths);

    writeRunState(run);
    writeFileSync(path.join(run.rootDir, "manuscript/full-manuscript.md"), "# Draft\n");
    writeFileSync(path.join(run.rootDir, "evaluations/revision-brief.md"), "# Review\n");

    const result = snapshotRunProgress(run, "write", DEFAULT_RUN_CONFIG.gitCommitPaths);
    assert.equal(result.createdCommit, true);

    const commitCount = Number(
      execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim(),
    );
    assert.equal(commitCount, 4);

    const log = execFileSync("git", ["log", "--format=%s", "-3"], { cwd: workspace, encoding: "utf8" }).trim();
    assert.match(log, /manuscript\/full-manuscript\.md/);
    assert.match(log, /evaluations\/revision-brief\.md/);
    assert.match(log, /\.book-genesis\/run\.json/);
  });
});

test("snapshotRunProgress is a no-op when there are no changes", () => {
  withWorkspace((workspace) => {
    const gitStatus = ensureWorkspaceGitRepo(workspace, DEFAULT_RUN_CONFIG);
    const run = createRunState(workspace, "literary thriller", DEFAULT_RUN_CONFIG);
    run.git = { repoRoot: gitStatus.repoRoot, initializedByRuntime: gitStatus.initialized };
    writeRunState(run);

    snapshotRunProgress(run, "kickoff", DEFAULT_RUN_CONFIG.gitCommitPaths);
    const second = snapshotRunProgress(run, "kickoff", DEFAULT_RUN_CONFIG.gitCommitPaths);
    assert.equal(second.createdCommit, false);
  });
});
