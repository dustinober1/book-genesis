import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import type { GitSnapshotResult, PhaseName, RunConfig, RunState } from "./types.js";

function tryGit(args: string[], cwd: string) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function runGit(args: string[], cwd: string) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function listChangedFiles(repoRoot: string, repoRelativePaths: string[]) {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "-z", "--", ...repoRelativePaths],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  return output
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ensureLocalAuthorConfig(repoRoot: string) {
  const name = tryGit(["config", "--get", "user.name"], repoRoot);
  const email = tryGit(["config", "--get", "user.email"], repoRoot);

  if (!name) {
    runGit(["config", "user.name", "Book Genesis"], repoRoot);
  }

  if (!email) {
    runGit(["config", "user.email", "book-genesis@local.invalid"], repoRoot);
  }
}

export function ensureWorkspaceGitRepo(workspaceRoot: string, config: RunConfig) {
  const repoRoot = tryGit(["rev-parse", "--show-toplevel"], workspaceRoot);
  if (repoRoot) {
    return { enabled: true, initialized: false, repoRoot };
  }

  if (!config.gitAutoInit) {
    return { enabled: false, initialized: false, repoRoot: undefined as string | undefined };
  }

  runGit(["init", "-b", "main"], workspaceRoot);
  const createdRepoRoot = runGit(["rev-parse", "--show-toplevel"], workspaceRoot);
  ensureLocalAuthorConfig(createdRepoRoot);
  return { enabled: true, initialized: true, repoRoot: createdRepoRoot };
}

function toRepoRelativePaths(repoRoot: string, workspaceRoot: string, paths: string[]) {
  const normalizedRepoRoot = realpathSync(repoRoot);
  const normalizedWorkspaceRoot = realpathSync(workspaceRoot);
  const workspaceRel = path.relative(normalizedRepoRoot, normalizedWorkspaceRoot);
  if (workspaceRel.startsWith("..") || path.isAbsolute(workspaceRel)) {
    return null;
  }

  const prefix = workspaceRel === "" ? "" : workspaceRel;
  return paths.map((entry) => (prefix ? path.join(prefix, entry) : entry));
}

export function snapshotRunProgress(run: RunState, phase: PhaseName, commitPaths: string[]): GitSnapshotResult {
  if (!run.config.gitAutoCommit) {
    return { enabled: false, initialized: false, createdCommit: false };
  }

  const repoRoot = run.git?.repoRoot ?? tryGit(["rev-parse", "--show-toplevel"], run.workspaceRoot);
  if (!repoRoot) {
    return { enabled: false, initialized: false, createdCommit: false };
  }

  const repoRelativePaths = toRepoRelativePaths(repoRoot, run.workspaceRoot, commitPaths);
  if (!repoRelativePaths) {
    return { enabled: false, initialized: false, createdCommit: false };
  }

  ensureLocalAuthorConfig(repoRoot);

  const existingPaths = repoRelativePaths.filter((entry) => existsSync(path.join(repoRoot, entry)));
  if (existingPaths.length === 0) {
    return { enabled: true, initialized: false, createdCommit: false };
  }

  runGit(["add", "-A", "--", ...existingPaths], repoRoot);
  const changedFiles = listChangedFiles(repoRoot, existingPaths);
  if (changedFiles.length === 0) {
    return { enabled: true, initialized: false, createdCommit: false };
  }

  let lastCommitMessage = "";
  for (const filePath of changedFiles) {
    const commitMessage = `[book-genesis:${phase}] ${filePath} ${run.id}`;
    runGit(["commit", "-m", commitMessage, "--", filePath], repoRoot);
    lastCommitMessage = commitMessage;
  }

  const sha = runGit(["rev-parse", "HEAD"], repoRoot);

  run.git = {
    ...run.git,
    repoRoot,
    lastSnapshotCommit: sha,
  };

  return {
    enabled: true,
    initialized: false,
    createdCommit: true,
    commitMessage: lastCommitMessage,
  };
}
