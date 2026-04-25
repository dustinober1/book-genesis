# Autonomous Quality Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kickoff intake, git bootstrap and hygiene, artifact validation, quality gates, explicit run configuration, structured ledgers, and a regression test harness so Book Genesis can run with less human oversight.

**Architecture:** Keep the current PI command and tool flow, but add a `kickoff` phase before autonomous research so the package can collect the brief it needs upfront. Split runtime support into focused modules: config loading, intake validation, git hygiene automation, artifact validation, structured ledger persistence, and quality gate decisions. State transitions remain centralized in `extensions/book-genesis/state.ts`, while prompt construction consumes shared artifact targets from the validation module and git snapshots are triggered at stable lifecycle points.

**Tech Stack:** TypeScript ESM, Node.js 20 built-in `node:test`, `tsx` for TypeScript test execution, existing PI extension APIs, `@sinclair/typebox` for tool schemas.

---

## File Structure

- Modify `package.json`: add `typecheck`, `test`, and `test:watch` scripts plus `typescript` and `tsx` dev dependencies.
- Modify `tsconfig.json`: include tests and keep strict Node-friendly module settings.
- Create `tests/state.test.ts`: covers run creation, phase completion, retry behavior, stop behavior, and future quality transitions.
- Create `tests/artifacts.test.ts`: covers artifact existence, non-empty files, directory contents, placeholder detection, and report formatting.
- Create `tests/config.test.ts`: covers default config, workspace config loading, explicit config path loading, and invalid config errors.
- Create `tests/intake.test.ts`: covers required kickoff fields, brief persistence, and kickoff-to-research transition.
- Create `tests/git.test.ts`: covers repository bootstrap, phase snapshot commits, and no-op behavior when there are no tracked changes.
- Create `tests/ledger.test.ts`: covers source and decision ledger writes.
- Modify `extensions/book-genesis/types.ts`: add kickoff, config, ledger, validation, and quality gate types.
- Create `extensions/book-genesis/config.ts`: load and normalize runtime config.
- Create `extensions/book-genesis/intake.ts`: validate kickoff answers and write a durable project brief.
- Create `extensions/book-genesis/git.ts`: initialize a repository when missing and snapshot run progress with scoped commits.
- Create `extensions/book-genesis/artifacts.ts`: own phase artifact targets and validation logic.
- Create `extensions/book-genesis/ledger.ts`: persist structured sources and decisions under `.book-genesis/ledger.json`.
- Create `extensions/book-genesis/quality.ts`: score normalization and next-phase decisions.
- Modify `extensions/book-genesis/state.ts`: use config defaults, persist validation and quality fields, and route revision/evaluation loops.
- Modify `extensions/book-genesis/prompts.ts`: import artifact targets from `artifacts.ts`, include config and ledger guidance in prompts and compaction.
- Modify `extensions/book-genesis/index.ts`: load config on run start, ensure git bootstrap when configured, validate completion artifacts, add ledger and quality tools, and improve status output.
- Modify prompt files under `prompts/book-genesis/`: require structured ledger and quality tool usage where relevant.
- Modify `README.md`: document config, validation behavior, quality gates, ledgers, and test commands.

## Implementation Strategy

Use small commits after each task. The first task creates the test harness. Every behavior task starts by adding a failing test, then implements the minimal runtime code to pass it. Keep `/book-genesis run` and `/book-auto` stable, but route them through kickoff before research unless a future config field explicitly disables intake. Git hygiene should stay conservative: initialize only when there is no repository, never rewrite history, and commit only files inside the active workspace.

### Task 1: Add The Test Harness

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tests/state.test.ts`

- [ ] **Step 1: Add test and typecheck scripts**

Edit `package.json` so the scripts and dev dependencies include:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --test --import tsx tests/**/*.test.ts",
    "test:watch": "node --test --watch --import tsx tests/**/*.test.ts"
  },
  "devDependencies": {
    "tsx": "^4.20.6",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Include tests in TypeScript project**

Edit `tsconfig.json` to include the runtime and tests:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["extensions/**/*.ts", "types/**/*.d.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install without peer dependency failures.

- [ ] **Step 4: Write baseline state tests**

Create `tests/state.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  completeCurrentPhase,
  createRunState,
  reportCurrentPhaseFailure,
  stopRun,
  writeRunState,
  readRunState,
} from "../extensions/book-genesis/state.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("createRunState initializes a research run", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "en a climate thriller about ocean cities");

    assert.equal(run.status, "running");
    assert.equal(run.currentPhase, "research");
    assert.equal(run.language, "en");
    assert.equal(run.idea, "a climate thriller about ocean cities");
    assert.equal(run.config.maxRetriesPerPhase, 1);
    assert.equal(run.config.chapterBatchSize, 3);
  });
});

test("completeCurrentPhase records artifacts and advances to foundation", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "space opera");
    completeCurrentPhase(run, {
      summary: "Research complete.",
      artifacts: ["research/market-research.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.currentPhase, "foundation");
    assert.deepEqual(run.completedPhases, ["research"]);
    assert.deepEqual(run.artifacts.research, ["research/market-research.md"]);
    assert.match(run.lastHandoffPath ?? "", /research\.md$/);
  });
});

test("retryable failure remains running until retry budget is exceeded", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "mystery novel");

    const first = reportCurrentPhaseFailure(run, {
      reason: "Temporary provider failure.",
      retryable: true,
      unresolvedIssues: ["Provider returned 503."],
    });
    assert.equal(first.shouldRetry, true);
    assert.equal(run.status, "running");

    run.attempts.research = 2;
    const second = reportCurrentPhaseFailure(run, {
      reason: "Provider still unavailable.",
      retryable: true,
      unresolvedIssues: ["Provider returned 503 twice."],
    });
    assert.equal(second.shouldRetry, false);
    assert.equal(run.status, "failed");
  });
});

test("writeRunState and readRunState round trip persisted state", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "memoir about rebuilding");
    writeRunState(run);

    const readBack = readRunState(run.rootDir);
    assert.equal(readBack.id, run.id);
    assert.equal(readBack.rootDir, run.rootDir);
  });
});

test("stopRun marks an active run as stopped", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "fantasy quest");
    stopRun(run, "Paused by operator.");

    assert.equal(run.status, "stopped");
    assert.equal(run.stopRequested, true);
    assert.equal(run.nextAction, "Paused by operator.");
  });
});
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: tests pass and `tsc --noEmit` succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json tests/state.test.ts
git commit -m "test: add runtime state harness"
```

### Task 2: Add Artifact Validation

**Files:**
- Create: `extensions/book-genesis/artifacts.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/types.ts`
- Create: `tests/artifacts.test.ts`

- [ ] **Step 1: Write failing artifact validation tests**

Create `tests/artifacts.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createRunState } from "../extensions/book-genesis/state.js";
import { validatePhaseArtifacts, formatArtifactValidationReport } from "../extensions/book-genesis/artifacts.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(createRunState(workspace, "detective novel"));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("validatePhaseArtifacts accepts required research files", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "research"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "research/market-research.md"), "# Market\nReaders want this.\n");
    writeFileSync(path.join(run.rootDir, "research/bestseller-dna.md"), "# DNA\nClear pattern.\n");

    const result = validatePhaseArtifacts(run, "research", [
      "research/market-research.md",
      "research/bestseller-dna.md",
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  });
});

test("validatePhaseArtifacts rejects missing required targets", () => {
  withRun((run) => {
    const result = validatePhaseArtifacts(run, "research", []);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "missing_required_target"), true);
  });
});

test("validatePhaseArtifacts rejects empty files and placeholders", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "research"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "research/market-research.md"), `TO${"DO"}\n`);
    writeFileSync(path.join(run.rootDir, "research/bestseller-dna.md"), "\n");

    const result = validatePhaseArtifacts(run, "research", [
      "research/market-research.md",
      "research/bestseller-dna.md",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "placeholder_text"), true);
    assert.equal(result.issues.some((issue) => issue.code === "empty_file"), true);
  });
});

test("formatArtifactValidationReport produces actionable text", () => {
  const text = formatArtifactValidationReport({
    ok: false,
    issues: [
      {
        code: "empty_file",
        target: "research/market-research.md",
        message: "Artifact file is empty.",
      },
    ],
  });

  assert.match(text, /Artifact validation failed/);
  assert.match(text, /research\/market-research\.md/);
});
```

- [ ] **Step 2: Add validation types**

Add these exports to `extensions/book-genesis/types.ts`:

```ts
export type ArtifactValidationCode =
  | "missing_required_target"
  | "missing_reported_artifact"
  | "empty_file"
  | "empty_directory"
  | "placeholder_text"
  | "path_outside_run";

export interface ArtifactValidationIssue {
  code: ArtifactValidationCode;
  target: string;
  message: string;
}

export interface ArtifactValidationResult {
  ok: boolean;
  issues: ArtifactValidationIssue[];
}
```

- [ ] **Step 3: Implement artifact validation**

Create `extensions/book-genesis/artifacts.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ArtifactValidationIssue, ArtifactValidationResult, PhaseName, RunState } from "./types.js";

export const ARTIFACT_TARGETS: Record<PhaseName, string[]> = {
  research: ["research/market-research.md", "research/bestseller-dna.md"],
  foundation: [
    "foundation/foundation.md",
    "foundation/outline.md",
    "foundation/reader-personas.md",
    "foundation/voice-dna.md",
  ],
  write: ["manuscript/chapters/", "manuscript/full-manuscript.md", "manuscript/write-report.md"],
  evaluate: [
    "evaluations/genesis-score.md",
    "evaluations/beta-readers.md",
    "evaluations/revision-brief.md",
  ],
  revise: ["manuscript/full-manuscript.md", "manuscript/chapters/", "evaluations/revision-log.md"],
  deliver: [
    "delivery/logline.md",
    "delivery/synopsis.md",
    "delivery/query-letter.md",
    "delivery/cover-brief.md",
    "delivery/package-summary.md",
  ],
};

const PLACEHOLDER_PATTERNS = [
  new RegExp(`\\bTO${"DO"}\\b`, "i"),
  new RegExp(`\\bT${"BD"}\\b`, "i"),
  /\bplaceholder\b/i,
  /\blorem ipsum\b/i,
];

function normalizeRelativePath(run: RunState, value: string) {
  const trimmed = value.trim();
  const absolute = path.isAbsolute(trimmed) ? trimmed : path.join(run.rootDir, trimmed);
  const relative = path.relative(run.rootDir, absolute);
  return { absolute, relative };
}

function isInsideRun(relative: string) {
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasVisibleDirectoryContent(absolute: string) {
  return readdirSync(absolute).some((entry) => !entry.startsWith("."));
}

function validateTarget(run: RunState, target: string, code: ArtifactValidationIssue["code"]) {
  const { absolute, relative } = normalizeRelativePath(run, target);
  const issues: ArtifactValidationIssue[] = [];

  if (!isInsideRun(relative)) {
    issues.push({
      code: "path_outside_run",
      target,
      message: "Artifact path must stay inside the run directory.",
    });
    return issues;
  }

  if (!existsSync(absolute)) {
    issues.push({
      code,
      target,
      message: code === "missing_required_target" ? "Required artifact target is missing." : "Reported artifact is missing.",
    });
    return issues;
  }

  const stat = statSync(absolute);
  if (stat.isDirectory()) {
    if (!hasVisibleDirectoryContent(absolute)) {
      issues.push({
        code: "empty_directory",
        target,
        message: "Artifact directory has no visible files.",
      });
    }
    return issues;
  }

  if (stat.size === 0) {
    issues.push({
      code: "empty_file",
      target,
      message: "Artifact file is empty.",
    });
    return issues;
  }

  const text = readFileSync(absolute, "utf8");
  if (!text.trim()) {
    issues.push({
      code: "empty_file",
      target,
      message: "Artifact file contains only whitespace.",
    });
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "placeholder_text",
      target,
      message: "Artifact contains placeholder text.",
    });
  }

  return issues;
}

export function validatePhaseArtifacts(
  run: RunState,
  phase: PhaseName,
  reportedArtifacts: string[],
): ArtifactValidationResult {
  const issues = [
    ...ARTIFACT_TARGETS[phase].flatMap((target) => validateTarget(run, target, "missing_required_target")),
    ...reportedArtifacts.flatMap((target) => validateTarget(run, target, "missing_reported_artifact")),
  ];

  return { ok: issues.length === 0, issues };
}

export function formatArtifactValidationReport(result: ArtifactValidationResult) {
  if (result.ok) {
    return "Artifact validation passed.";
  }

  return [
    "Artifact validation failed:",
    ...result.issues.map((issue) => `- ${issue.target}: ${issue.message} [${issue.code}]`),
  ].join("\n");
}
```

- [ ] **Step 4: Reuse artifact targets in prompt construction**

In `extensions/book-genesis/prompts.ts`, remove the local `ARTIFACT_TARGETS` constant and add:

```ts
import { ARTIFACT_TARGETS } from "./artifacts.js";
```

- [ ] **Step 5: Gate phase completion in the PI tool**

In `extensions/book-genesis/index.ts`, import validation helpers:

```ts
import { formatArtifactValidationReport, validatePhaseArtifacts } from "./artifacts.js";
```

Inside `book_genesis_complete_phase.execute`, before `completeCurrentPhase`, add:

```ts
const artifacts = params.artifacts ?? [];
const validation = validatePhaseArtifacts(run, params.phase, artifacts);
if (!validation.ok) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: formatArtifactValidationReport(validation),
      },
    ],
  };
}
```

Then pass `artifacts` into `completeCurrentPhase`.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass and TypeScript has no errors.

- [ ] **Step 7: Commit**

```bash
git add extensions/book-genesis/artifacts.ts extensions/book-genesis/prompts.ts extensions/book-genesis/index.ts extensions/book-genesis/types.ts tests/artifacts.test.ts
git commit -m "feat: validate phase artifacts"
```

### Task 3: Add Explicit Run Configuration

**Files:**
- Create: `extensions/book-genesis/config.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/config.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG, loadRunConfig } from "../extensions/book-genesis/config.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("loadRunConfig returns defaults when no config exists", () => {
  withWorkspace((workspace) => {
    assert.deepEqual(loadRunConfig(workspace), DEFAULT_RUN_CONFIG);
  });
});

test("loadRunConfig merges workspace config with defaults", () => {
  withWorkspace((workspace) => {
    writeFileSync(
      path.join(workspace, "book-genesis.config.json"),
      JSON.stringify({ qualityThreshold: 88, chapterBatchSize: 5 }, null, 2),
    );

    const config = loadRunConfig(workspace);
    assert.equal(config.qualityThreshold, 88);
    assert.equal(config.chapterBatchSize, 5);
    assert.equal(config.maxRetriesPerPhase, DEFAULT_RUN_CONFIG.maxRetriesPerPhase);
  });
});

test("loadRunConfig rejects invalid values", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({ qualityThreshold: 101 }));

    assert.throws(() => loadRunConfig(workspace), /qualityThreshold must be between 1 and 100/);
  });
});
```

- [ ] **Step 2: Add config types**

In `extensions/book-genesis/types.ts`, add:

```ts
export type ResearchDepth = "standard" | "deep";

export interface RunConfig {
  maxRetriesPerPhase: number;
  chapterBatchSize: number;
  qualityThreshold: number;
  maxRevisionCycles: number;
  researchDepth: ResearchDepth;
  targetWordCount?: number;
  audience?: string;
  tone?: string;
}
```

Change `RunState.config` to:

```ts
config: RunConfig;
```

- [ ] **Step 3: Implement config loading**

Create `extensions/book-genesis/config.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunConfig } from "./types.js";

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxRetriesPerPhase: 1,
  chapterBatchSize: 3,
  qualityThreshold: 85,
  maxRevisionCycles: 2,
  researchDepth: "standard",
};

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function normalizeConfig(value: Partial<RunConfig>): RunConfig {
  const config = { ...DEFAULT_RUN_CONFIG, ...value };

  assertPositiveInteger("maxRetriesPerPhase", config.maxRetriesPerPhase);
  assertPositiveInteger("chapterBatchSize", config.chapterBatchSize);
  assertPositiveInteger("maxRevisionCycles", config.maxRevisionCycles);

  if (!Number.isInteger(config.qualityThreshold) || config.qualityThreshold < 1 || config.qualityThreshold > 100) {
    throw new Error("qualityThreshold must be between 1 and 100.");
  }

  if (config.researchDepth !== "standard" && config.researchDepth !== "deep") {
    throw new Error("researchDepth must be standard or deep.");
  }

  if (config.targetWordCount !== undefined) {
    assertPositiveInteger("targetWordCount", config.targetWordCount);
  }

  return config;
}

export function loadRunConfig(workspaceRoot: string, configPath?: string) {
  const resolvedPath = configPath
    ? path.resolve(workspaceRoot, configPath)
    : path.join(workspaceRoot, "book-genesis.config.json");

  if (!existsSync(resolvedPath)) {
    return DEFAULT_RUN_CONFIG;
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as Partial<RunConfig>;
  return normalizeConfig(parsed);
}
```

- [ ] **Step 4: Thread config into run state creation**

Change `createRunState` signature in `extensions/book-genesis/state.ts`:

```ts
export function createRunState(workspaceRoot: string, rawIdea: string, config: RunConfig = DEFAULT_RUN_CONFIG): RunState
```

Import `DEFAULT_RUN_CONFIG` and `RunConfig`, then set:

```ts
config,
```

- [ ] **Step 5: Load config in command handlers**

In `extensions/book-genesis/index.ts`, import:

```ts
import { loadRunConfig } from "./config.js";
```

Add this parser near `parseSubcommand`:

```ts
function parseRunArgs(args: string) {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const configIndex = tokens.indexOf("--config");
  if (configIndex === -1) {
    return { configPath: undefined, ideaInput: args };
  }

  const configPath = tokens[configIndex + 1];
  if (!configPath) {
    throw new Error("--config requires a path.");
  }

  const ideaTokens = tokens.filter((_, index) => index !== configIndex && index !== configIndex + 1);
  return { configPath, ideaInput: ideaTokens.join(" ") };
}
```

Use it in both `run` and `book-auto`:

```ts
const { configPath, ideaInput } = parseRunArgs(rest);
const parsed = parseIdeaInput(ideaInput);
const config = loadRunConfig(process.cwd(), configPath);
const run = createRunState(process.cwd(), ideaInput, config);
```

- [ ] **Step 6: Include config in phase prompts**

In `buildPhasePrompt`, add:

```ts
`Config: ${JSON.stringify(run.config)}`,
```

Place it after the idea line so every phase has the same config context.

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add extensions/book-genesis/config.ts extensions/book-genesis/types.ts extensions/book-genesis/state.ts extensions/book-genesis/index.ts extensions/book-genesis/prompts.ts tests/config.test.ts
git commit -m "feat: add run configuration"
```

### Task 4: Add Kickoff Intake Before Autonomous Research

**Files:**
- Create: `extensions/book-genesis/intake.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `prompts/book-genesis/kickoff.md`
- Create: `tests/intake.test.ts`
- Modify: `tests/state.test.ts`

- [ ] **Step 1: Write failing intake tests**

Create `tests/intake.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createRunState } from "../extensions/book-genesis/state.js";
import { validateKickoffIntake, writeKickoffBrief } from "../extensions/book-genesis/intake.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(createRunState(workspace, "near future thriller"));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("validateKickoffIntake accepts a complete project brief", () => {
  const result = validateKickoffIntake({
    workingTitle: "Salt Cities",
    genre: "near future thriller",
    targetReader: "adult climate fiction readers",
    promise: "a tense survival story with political intrigue",
    targetLength: "70,000 words",
    tone: "urgent and cinematic",
    constraints: ["avoid graphic violence", "keep chapters short"],
    successCriteria: ["coherent ending", "strong query package"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("validateKickoffIntake rejects missing required answers", () => {
  const result = validateKickoffIntake({
    workingTitle: "",
    genre: "thriller",
    targetReader: "",
    promise: "fast pacing",
    targetLength: "70,000 words",
    tone: "tense",
    constraints: [],
    successCriteria: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("workingTitle is required."), true);
  assert.equal(result.issues.includes("targetReader is required."), true);
});

test("writeKickoffBrief persists intake markdown inside the run", () => {
  withRun((run) => {
    const briefPath = writeKickoffBrief(run, {
      workingTitle: "Salt Cities",
      genre: "near future thriller",
      targetReader: "adult climate fiction readers",
      promise: "a tense survival story with political intrigue",
      targetLength: "70,000 words",
      tone: "urgent and cinematic",
      constraints: ["avoid graphic violence"],
      successCriteria: ["coherent ending"],
    });

    assert.equal(briefPath, path.join(run.rootDir, "foundation/project-brief.md"));
    assert.equal(existsSync(briefPath), true);
    assert.match(readFileSync(briefPath, "utf8"), /Salt Cities/);
  });
});
```

- [ ] **Step 2: Add kickoff types and phase**

In `extensions/book-genesis/types.ts`, change `PHASE_ORDER` to:

```ts
export const PHASE_ORDER = [
  "kickoff",
  "research",
  "foundation",
  "write",
  "evaluate",
  "revise",
  "deliver",
] as const;
```

Add the role:

```ts
kickoff: "intake strategist",
```

Add these types:

```ts
export interface KickoffIntake {
  workingTitle: string;
  genre: string;
  targetReader: string;
  promise: string;
  targetLength: string;
  tone: string;
  constraints: string[];
  successCriteria: string[];
}

export interface KickoffValidationResult {
  ok: boolean;
  issues: string[];
}
```

Add this field to `RunState`:

```ts
kickoff?: KickoffIntake;
```

- [ ] **Step 3: Update phase maps for kickoff**

In `createPhaseMap` in `extensions/book-genesis/state.ts`, add:

```ts
kickoff: factory(),
```

Update the baseline state test in `tests/state.test.ts`:

```ts
assert.equal(run.currentPhase, "kickoff");
```

- [ ] **Step 4: Implement intake validation and brief writing**

Create `extensions/book-genesis/intake.ts`:

```ts
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { KickoffIntake, KickoffValidationResult, RunState } from "./types.js";
import { ensureRunDirectories } from "./state.js";

const REQUIRED_FIELDS: Array<keyof Pick<
  KickoffIntake,
  "workingTitle" | "genre" | "targetReader" | "promise" | "targetLength" | "tone"
>> = ["workingTitle", "genre", "targetReader", "promise", "targetLength", "tone"];

function cleanList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function normalizeKickoffIntake(input: KickoffIntake): KickoffIntake {
  return {
    workingTitle: input.workingTitle.trim(),
    genre: input.genre.trim(),
    targetReader: input.targetReader.trim(),
    promise: input.promise.trim(),
    targetLength: input.targetLength.trim(),
    tone: input.tone.trim(),
    constraints: cleanList(input.constraints),
    successCriteria: cleanList(input.successCriteria),
  };
}

export function validateKickoffIntake(input: KickoffIntake): KickoffValidationResult {
  const normalized = normalizeKickoffIntake(input);
  const issues = REQUIRED_FIELDS
    .filter((field) => !normalized[field])
    .map((field) => `${field} is required.`);

  if (normalized.successCriteria.length === 0) {
    issues.push("successCriteria must include at least one item.");
  }

  return { ok: issues.length === 0, issues };
}

export function writeKickoffBrief(run: RunState, input: KickoffIntake) {
  const normalized = normalizeKickoffIntake(input);
  ensureRunDirectories(run.rootDir);

  const briefPath = path.join(run.rootDir, "foundation", "project-brief.md");
  const constraints = normalized.constraints.length > 0
    ? normalized.constraints.map((item) => `- ${item}`).join("\n")
    : "- none";
  const successCriteria = normalized.successCriteria.map((item) => `- ${item}`).join("\n");

  const content = [
    "# Project Brief",
    "",
    `- Working title: ${normalized.workingTitle}`,
    `- Genre: ${normalized.genre}`,
    `- Target reader: ${normalized.targetReader}`,
    `- Promise: ${normalized.promise}`,
    `- Target length: ${normalized.targetLength}`,
    `- Tone: ${normalized.tone}`,
    "",
    "## Constraints",
    constraints,
    "",
    "## Success Criteria",
    successCriteria,
    "",
  ].join("\n");

  writeFileSync(briefPath, content, "utf8");
  return briefPath;
}
```

- [ ] **Step 5: Add kickoff prompt**

Create `prompts/book-genesis/kickoff.md`:

```md
# Kickoff Intake

Before autonomous research begins, collect the minimum project brief needed to avoid repeated human supervision.

Ask the human concise questions until you can answer all required fields:
- workingTitle
- genre
- targetReader
- promise
- targetLength
- tone
- constraints
- successCriteria

Do not ask for optional polish. Prefer one compact batch of questions when several fields are missing. When the brief is complete, call `book_genesis_complete_kickoff` with the final answers.
```

- [ ] **Step 6: Add kickoff artifact target**

In `extensions/book-genesis/artifacts.ts`, add:

```ts
kickoff: ["foundation/project-brief.md"],
```

- [ ] **Step 7: Include kickoff brief in prompts**

In `buildPhasePrompt`, after `Previous handoff`, add:

```ts
"Project brief:",
run.kickoff ? JSON.stringify(run.kickoff, null, 2) : "No kickoff brief has been recorded yet.",
"",
```

- [ ] **Step 8: Add kickoff completion tool**

In `extensions/book-genesis/index.ts`, import:

```ts
import { validateKickoffIntake, writeKickoffBrief } from "./intake.js";
```

Register this tool before `book_genesis_complete_phase`:

```ts
pi.registerTool({
  name: "book_genesis_complete_kickoff",
  label: "Book Genesis Complete Kickoff",
  description: "Record kickoff intake answers, write the project brief, and advance to research.",
  promptSnippet: "Use this once the human has provided enough kickoff information to start autonomous research.",
  parameters: Type.Object({
    run_dir: Type.String(),
    workingTitle: Type.String(),
    genre: Type.String(),
    targetReader: Type.String(),
    promise: Type.String(),
    targetLength: Type.String(),
    tone: Type.String(),
    constraints: Type.Array(Type.String()),
    successCriteria: Type.Array(Type.String()),
  }),
  async execute(_toolCallId: string, params: any) {
    const run = readRunState(stripQuotes(params.run_dir));
    if (run.currentPhase !== "kickoff") {
      return {
        isError: true,
        content: [{ type: "text", text: `Run is on phase ${run.currentPhase}, not kickoff.` }],
      };
    }

    const intake = {
      workingTitle: params.workingTitle,
      genre: params.genre,
      targetReader: params.targetReader,
      promise: params.promise,
      targetLength: params.targetLength,
      tone: params.tone,
      constraints: params.constraints,
      successCriteria: params.successCriteria,
    };
    const validation = validateKickoffIntake(intake);
    if (!validation.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: validation.issues.join("\n") }],
      };
    }

    const briefPath = writeKickoffBrief(run, intake);
    run.kickoff = intake;
    completeCurrentPhase(run, {
      summary: "Kickoff intake complete.",
      artifacts: [briefPath],
      unresolvedIssues: [],
    });
    writeRunState(run);
    pi.sendUserMessage(`/book-genesis resume "${run.rootDir}"`, { deliverAs: "followUp" });

    return { content: [{ type: "text", text: "Kickoff complete. Research queued." }] };
  },
});
```

- [ ] **Step 9: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add extensions/book-genesis/intake.ts extensions/book-genesis/types.ts extensions/book-genesis/state.ts extensions/book-genesis/prompts.ts extensions/book-genesis/index.ts extensions/book-genesis/artifacts.ts prompts/book-genesis/kickoff.md tests/intake.test.ts tests/state.test.ts
git commit -m "feat: add kickoff intake"
```

### Task 5: Add Git Bootstrap And Snapshot Hygiene

**Files:**
- Create: `extensions/book-genesis/git.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/config.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/state.ts`
- Create: `tests/git.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing git hygiene tests**

Create `tests/git.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { ensureWorkspaceGitRepo, snapshotRunProgress } from "../extensions/book-genesis/git.js";
import { createRunState } from "../extensions/book-genesis/state.js";

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
    assert.match(execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: workspace, encoding: "utf8" }), /true/);
  });
});

test("snapshotRunProgress creates a commit when tracked files changed", () => {
  withWorkspace((workspace) => {
    ensureWorkspaceGitRepo(workspace, DEFAULT_RUN_CONFIG);
    writeFileSync(path.join(workspace, ".gitignore"), "book-projects/\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: workspace });
    execFileSync("git", ["commit", "-m", "seed repo"], { cwd: workspace });

    const run = createRunState(workspace, "literary thriller", DEFAULT_RUN_CONFIG);
    writeFileSync(path.join(run.rootDir, ".book-genesis", "note.txt"), "snapshot\n");
    const result = snapshotRunProgress(run, "research", DEFAULT_RUN_CONFIG.gitCommitPaths);

    assert.equal(result.createdCommit, true);
    assert.match(result.commitMessage ?? "", /\[book-genesis:research\]/);
  });
});

test("snapshotRunProgress is a no-op when there are no changes", () => {
  withWorkspace((workspace) => {
    ensureWorkspaceGitRepo(workspace, DEFAULT_RUN_CONFIG);
    const run = createRunState(workspace, "literary thriller", DEFAULT_RUN_CONFIG);
    const result = snapshotRunProgress(run, "research", DEFAULT_RUN_CONFIG.gitCommitPaths);

    assert.equal(result.createdCommit, false);
  });
});
```

- [ ] **Step 2: Add git automation config and state types**

In `extensions/book-genesis/types.ts`, add:

```ts
export interface GitSnapshotResult {
  enabled: boolean;
  initialized: boolean;
  createdCommit: boolean;
  commitMessage?: string;
}
```

Extend `RunConfig` with:

```ts
gitAutoInit: boolean;
gitAutoCommit: boolean;
gitCommitPaths: string[];
```

Extend `RunState` with:

```ts
git?: {
  repoRoot?: string;
  initializedByRuntime?: boolean;
  lastSnapshotCommit?: string;
};
```

- [ ] **Step 3: Add config defaults for git hygiene**

In `extensions/book-genesis/config.ts`, extend `DEFAULT_RUN_CONFIG`:

```ts
gitAutoInit: true,
gitAutoCommit: true,
gitCommitPaths: ["book-projects", ".book-genesis"],
```

In `normalizeConfig`, add:

```ts
if (!Array.isArray(config.gitCommitPaths) || config.gitCommitPaths.some((value) => typeof value !== "string" || !value.trim())) {
  throw new Error("gitCommitPaths must be a non-empty array of relative paths.");
}
```

- [ ] **Step 4: Implement repository bootstrap and snapshot helpers**

Create `extensions/book-genesis/git.ts`:

```ts
import { execFileSync } from "node:child_process";

import type { GitSnapshotResult, PhaseName, RunConfig, RunState } from "./types.js";

function tryGit(args: string[], cwd: string) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function runGit(args: string[], cwd: string) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function ensureWorkspaceGitRepo(workspaceRoot: string, config: RunConfig) {
  const insideRepo = tryGit(["rev-parse", "--show-toplevel"], workspaceRoot);
  if (insideRepo) {
    return { enabled: true, initialized: false, repoRoot: insideRepo };
  }

  if (!config.gitAutoInit) {
    return { enabled: false, initialized: false, repoRoot: undefined };
  }

  runGit(["init", "-b", "main"], workspaceRoot);
  runGit(["config", "user.name", "Book Genesis"], workspaceRoot);
  runGit(["config", "user.email", "book-genesis@local.invalid"], workspaceRoot);

  return {
    enabled: true,
    initialized: true,
    repoRoot: runGit(["rev-parse", "--show-toplevel"], workspaceRoot),
  };
}

export function snapshotRunProgress(run: RunState, phase: PhaseName, commitPaths: string[]): GitSnapshotResult {
  if (!run.config.gitAutoCommit) {
    return { enabled: false, initialized: false, createdCommit: false };
  }

  const repoRoot = run.git?.repoRoot ?? tryGit(["rev-parse", "--show-toplevel"], run.workspaceRoot);
  if (!repoRoot) {
    return { enabled: false, initialized: false, createdCommit: false };
  }

  runGit(["add", "--", ...commitPaths], repoRoot);
  const status = runGit(["status", "--short", "--", ...commitPaths], repoRoot);
  if (!status.trim()) {
    return { enabled: true, initialized: false, createdCommit: false };
  }

  const commitMessage = `[book-genesis:${phase}] snapshot ${run.id}`;
  runGit(["commit", "-m", commitMessage], repoRoot);
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
    commitMessage,
  };
}
```

- [ ] **Step 5: Bootstrap git when a run starts**

In `extensions/book-genesis/index.ts`, import:

```ts
import { ensureWorkspaceGitRepo, snapshotRunProgress } from "./git.js";
```

In both `run` handlers, after loading config and before `createRunState`, add:

```ts
const gitStatus = ensureWorkspaceGitRepo(process.cwd(), config);
```

After creating the run, set:

```ts
run.git = {
  repoRoot: gitStatus.repoRoot,
  initializedByRuntime: gitStatus.initialized,
};
```

- [ ] **Step 6: Create automatic phase snapshot commits**

In `book_genesis_complete_phase.execute`, after `writeRunState(run)` and before the completion response, add:

```ts
const snapshot = snapshotRunProgress(run, params.phase, run.config.gitCommitPaths);
if (snapshot.createdCommit) {
  writeRunState(run);
}
```

In `book_genesis_complete_kickoff.execute`, after `writeRunState(run)`, add:

```ts
const kickoffSnapshot = snapshotRunProgress(run, "kickoff", run.config.gitCommitPaths);
if (kickoffSnapshot.createdCommit) {
  writeRunState(run);
}
```

- [ ] **Step 7: Surface git snapshot status in run status**

In `formatRunStatus` in `extensions/book-genesis/state.ts`, append:

```ts
if (run.git?.repoRoot) {
  lines.push(`Git repo: ${run.git.repoRoot}`);
}

if (run.git?.initializedByRuntime) {
  lines.push("Git init: initialized by runtime");
}

if (run.git?.lastSnapshotCommit) {
  lines.push(`Last snapshot commit: ${run.git.lastSnapshotCommit}`);
}
```

- [ ] **Step 8: Document git hygiene behavior**

Add to `README.md`:

````md
## Git Hygiene

When `gitAutoInit` is enabled, Book Genesis initializes a repository in the workspace only if one does not already exist. When `gitAutoCommit` is enabled, each completed phase stages `gitCommitPaths` and writes a snapshot commit like `[book-genesis:research] snapshot <run-id>`.

```json
{
  "gitAutoInit": true,
  "gitAutoCommit": true,
  "gitCommitPaths": ["book-projects", ".book-genesis"]
}
```
````

- [ ] **Step 9: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add extensions/book-genesis/git.ts extensions/book-genesis/types.ts extensions/book-genesis/config.ts extensions/book-genesis/index.ts extensions/book-genesis/state.ts tests/git.test.ts README.md
git commit -m "feat: add git hygiene automation"
```

### Task 6: Add Structured Source And Decision Ledgers

**Files:**
- Create: `extensions/book-genesis/ledger.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Create: `tests/ledger.test.ts`

- [ ] **Step 1: Write failing ledger tests**

Create `tests/ledger.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createRunState } from "../extensions/book-genesis/state.js";
import { readLedger, recordDecision, recordSource } from "../extensions/book-genesis/ledger.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(createRunState(workspace, "romance novel"));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("recordSource appends a source ledger entry", () => {
  withRun((run) => {
    recordSource(run, {
      phase: "research",
      title: "Romance readership report",
      url: "https://example.com/report",
      summary: "Audience expects emotional stakes.",
      usefulness: "Shapes target reader and comp titles.",
    });

    const ledger = readLedger(run);
    assert.equal(ledger.sources.length, 1);
    assert.equal(ledger.sources[0].phase, "research");
  });
});

test("recordDecision appends a decision ledger entry", () => {
  withRun((run) => {
    recordDecision(run, {
      phase: "foundation",
      decision: "Use dual point of view.",
      rationale: "The premise needs both leads' emotional arcs.",
      impact: "Outline alternates chapter perspective.",
    });

    const ledger = readLedger(run);
    assert.equal(ledger.decisions.length, 1);
    assert.equal(ledger.decisions[0].decision, "Use dual point of view.");
  });
});
```

- [ ] **Step 2: Add ledger types to `types.ts`**

```ts
export interface SourceLedgerEntry {
  phase: PhaseName;
  title: string;
  url?: string;
  summary: string;
  usefulness: string;
  recordedAt: string;
}

export interface DecisionLedgerEntry {
  phase: PhaseName;
  decision: string;
  rationale: string;
  impact: string;
  recordedAt: string;
}

export interface RunLedger {
  sources: SourceLedgerEntry[];
  decisions: DecisionLedgerEntry[];
}
```

Add this field to `RunState`:

```ts
ledgerPath: string;
```

- [ ] **Step 3: Set ledger path on run creation**

In `createRunState`, add:

```ts
const ledgerPath = path.join(rootDir, STATE_DIRNAME, "ledger.json");
```

Set `ledgerPath` on the returned run.

- [ ] **Step 4: Implement ledger persistence**

Create `extensions/book-genesis/ledger.ts`:

```ts
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
```

- [ ] **Step 5: Add PI tools for ledgers**

In `extensions/book-genesis/index.ts`, import:

```ts
import { recordDecision, recordSource } from "./ledger.js";
```

Register `book_genesis_record_source`:

```ts
pi.registerTool({
  name: "book_genesis_record_source",
  label: "Book Genesis Record Source",
  description: "Record a source used by the active Book Genesis run.",
  promptSnippet: "Use this when research or evaluation depends on a concrete source.",
  parameters: Type.Object({
    run_dir: Type.String(),
    phase: StringEnum(PHASE_ORDER),
    title: Type.String(),
    url: Type.Optional(Type.String()),
    summary: Type.String(),
    usefulness: Type.String(),
  }),
  async execute(_toolCallId: string, params: any) {
    const run = readRunState(stripQuotes(params.run_dir));
    recordSource(run, {
      phase: params.phase,
      title: params.title,
      url: params.url,
      summary: params.summary,
      usefulness: params.usefulness,
    });

    return { content: [{ type: "text", text: "Recorded Book Genesis source." }] };
  },
});
```

Register `book_genesis_record_decision`:

```ts
pi.registerTool({
  name: "book_genesis_record_decision",
  label: "Book Genesis Record Decision",
  description: "Record a durable creative or strategic decision for the active Book Genesis run.",
  promptSnippet: "Use this when a phase makes a decision later phases should preserve.",
  parameters: Type.Object({
    run_dir: Type.String(),
    phase: StringEnum(PHASE_ORDER),
    decision: Type.String(),
    rationale: Type.String(),
    impact: Type.String(),
  }),
  async execute(_toolCallId: string, params: any) {
    const run = readRunState(stripQuotes(params.run_dir));
    recordDecision(run, {
      phase: params.phase,
      decision: params.decision,
      rationale: params.rationale,
      impact: params.impact,
    });

    return { content: [{ type: "text", text: "Recorded Book Genesis decision." }] };
  },
});
```

- [ ] **Step 6: Include ledger location in prompts and compaction**

In `buildRunMarker`, add:

```ts
`ledger_path: ${run.ledgerPath}`,
```

In `buildPhasePrompt`, add:

```ts
`Ledger file: ${run.ledgerPath}`,
```

In `buildCompactionSummary`, add:

```ts
`Ledger: ${run.ledgerPath}`,
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add extensions/book-genesis/ledger.ts extensions/book-genesis/types.ts extensions/book-genesis/state.ts extensions/book-genesis/index.ts extensions/book-genesis/prompts.ts tests/ledger.test.ts
git commit -m "feat: add structured run ledgers"
```

### Task 7: Add Quality Gates And Auto-Revision Loops

**Files:**
- Create: `extensions/book-genesis/quality.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `tests/state.test.ts`

- [ ] **Step 1: Add failing state tests for quality routing**

Append to `tests/state.test.ts`:

```ts
test("evaluate with passing quality gate advances directly to deliver", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", { ...DEFAULT_RUN_CONFIG, qualityThreshold: 80 });
    run.currentPhase = "evaluate";

    completeCurrentPhase(run, {
      summary: "Evaluation passed.",
      artifacts: ["evaluations/genesis-score.md"],
      unresolvedIssues: [],
      qualityGate: {
        threshold: 80,
        scores: {
          marketFit: 88,
          structure: 90,
          prose: 86,
          consistency: 84,
          deliveryReadiness: 89,
        },
        repairBrief: "",
      },
    });

    assert.equal(run.status, "running");
    assert.equal(run.currentPhase, "deliver");
    assert.equal(run.qualityGates.at(-1)?.passed, true);
  });
});

test("evaluate with failing quality gate routes to revise", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", { ...DEFAULT_RUN_CONFIG, qualityThreshold: 90 });
    run.currentPhase = "evaluate";

    completeCurrentPhase(run, {
      summary: "Evaluation found weaknesses.",
      artifacts: ["evaluations/genesis-score.md"],
      unresolvedIssues: ["Structure below threshold."],
      qualityGate: {
        threshold: 90,
        scores: {
          marketFit: 91,
          structure: 72,
          prose: 88,
          consistency: 84,
          deliveryReadiness: 80,
        },
        repairBrief: "Strengthen midpoint escalation and ending payoff.",
      },
    });

    assert.equal(run.currentPhase, "revise");
    assert.equal(run.revisionCycle, 1);
    assert.match(run.nextAction, /Strengthen midpoint/);
  });
});

test("revise after failed gate routes back to evaluate", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic");
    run.currentPhase = "revise";
    run.revisionCycle = 1;
    run.qualityGates.push({
      phase: "evaluate",
      threshold: 85,
      passed: false,
      scores: {
        marketFit: 91,
        structure: 72,
        prose: 88,
        consistency: 84,
        deliveryReadiness: 80,
      },
      repairBrief: "Fix structure.",
      recordedAt: new Date().toISOString(),
    });

    completeCurrentPhase(run, {
      summary: "Revision complete.",
      artifacts: ["manuscript/full-manuscript.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.currentPhase, "evaluate");
  });
});
```

Import `DEFAULT_RUN_CONFIG` at the top of `tests/state.test.ts`:

```ts
import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
```

- [ ] **Step 2: Add quality types**

In `extensions/book-genesis/types.ts`, add:

```ts
export interface QualityScores {
  marketFit: number;
  structure: number;
  prose: number;
  consistency: number;
  deliveryReadiness: number;
}

export interface QualityGateInput {
  threshold: number;
  scores: QualityScores;
  repairBrief: string;
}

export interface QualityGateRecord extends QualityGateInput {
  phase: PhaseName;
  passed: boolean;
  recordedAt: string;
}
```

Update `PhaseCompletionPayload`:

```ts
qualityGate?: QualityGateInput;
```

Add these fields to `RunState`:

```ts
qualityGates: QualityGateRecord[];
revisionCycle: number;
```

- [ ] **Step 3: Implement quality helpers**

Create `extensions/book-genesis/quality.ts`:

```ts
import type { QualityGateInput, QualityGateRecord, QualityScores } from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

export function normalizeScore(name: keyof QualityScores, value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${name} score must be an integer between 1 and 100.`);
  }
  return value;
}

export function createQualityGate(input: QualityGateInput): QualityGateRecord {
  const scores: QualityScores = {
    marketFit: normalizeScore("marketFit", input.scores.marketFit),
    structure: normalizeScore("structure", input.scores.structure),
    prose: normalizeScore("prose", input.scores.prose),
    consistency: normalizeScore("consistency", input.scores.consistency),
    deliveryReadiness: normalizeScore("deliveryReadiness", input.scores.deliveryReadiness),
  };

  const passed = Object.values(scores).every((score) => score >= input.threshold);

  return {
    phase: "evaluate",
    threshold: input.threshold,
    scores,
    repairBrief: input.repairBrief.trim(),
    passed,
    recordedAt: nowIso(),
  };
}
```

- [ ] **Step 4: Initialize quality fields in `createRunState`**

Set:

```ts
qualityGates: [],
revisionCycle: 0,
```

- [ ] **Step 5: Route phases using quality gates**

In `completeCurrentPhase`, import `createQualityGate` and add logic after artifact and handoff persistence:

```ts
if (phase === "evaluate" && payload.qualityGate) {
  const gate = createQualityGate(payload.qualityGate);
  run.qualityGates.push(gate);

  if (!gate.passed) {
    run.revisionCycle += 1;
    if (run.revisionCycle > run.config.maxRevisionCycles) {
      run.status = "failed";
      run.nextAction = `Manual review required after ${run.config.maxRevisionCycles} revision cycles.`;
      run.unresolvedIssues = [gate.repairBrief || "Quality gate failed after maximum revision cycles."];
      return;
    }

    run.currentPhase = "revise";
    run.status = run.stopRequested ? "stopped" : "running";
    run.nextAction = gate.repairBrief
      ? `Revise manuscript using repair brief: ${gate.repairBrief}`
      : "Revise manuscript using the latest evaluation findings.";
    return;
  }

  run.currentPhase = "deliver";
  run.status = run.stopRequested ? "stopped" : "running";
  run.nextAction = run.stopRequested ? "Run paused before deliver phase." : "Launch deliver phase.";
  return;
}

if (phase === "revise" && run.qualityGates.some((gate) => !gate.passed)) {
  run.currentPhase = "evaluate";
  run.status = run.stopRequested ? "stopped" : "running";
  run.nextAction = run.stopRequested ? "Run paused before evaluate phase." : "Re-evaluate revised manuscript.";
  return;
}
```

Keep existing `getNextPhase` fallback for phases without quality behavior.

- [ ] **Step 6: Accept quality gate data in completion tool**

In `book_genesis_complete_phase.parameters`, add:

```ts
quality_gate: Type.Optional(Type.Object({
  threshold: Type.Number(),
  scores: Type.Object({
    marketFit: Type.Number(),
    structure: Type.Number(),
    prose: Type.Number(),
    consistency: Type.Number(),
    deliveryReadiness: Type.Number(),
  }),
  repairBrief: Type.String(),
})),
```

Pass it into `completeCurrentPhase`:

```ts
qualityGate: params.quality_gate,
```

- [ ] **Step 7: Require quality gates in evaluation prompt**

In `prompts/book-genesis/evaluate.md`, add a completion requirement:

```md
Before calling `book_genesis_complete_phase`, include `quality_gate` with integer scores from 1 to 100 for marketFit, structure, prose, consistency, and deliveryReadiness. Use the run's qualityThreshold as the threshold. If any score is below threshold, write a concrete repairBrief that the revise phase can execute.
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add extensions/book-genesis/quality.ts extensions/book-genesis/types.ts extensions/book-genesis/state.ts extensions/book-genesis/index.ts extensions/book-genesis/prompts.ts prompts/book-genesis/evaluate.md tests/state.test.ts
git commit -m "feat: add quality gates"
```

### Task 8: Update Prompts, Status, And Documentation

**Files:**
- Modify: `prompts/book-genesis/research.md`
- Modify: `prompts/book-genesis/foundation.md`
- Modify: `prompts/book-genesis/write.md`
- Modify: `prompts/book-genesis/evaluate.md`
- Modify: `prompts/book-genesis/revise.md`
- Modify: `prompts/book-genesis/deliver.md`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `README.md`

- [ ] **Step 1: Add phase-specific structured-output instructions**

In `prompts/book-genesis/research.md`, add:

```md
Record every material external source with `book_genesis_record_source`. Each source entry must explain why it changed the project direction or confirmed an assumption.
```

In `prompts/book-genesis/foundation.md`, add:

```md
Record durable creative choices with `book_genesis_record_decision`, including target reader, promise, structure, voice, and any tradeoffs that later phases must preserve.
```

In `prompts/book-genesis/write.md`, add:

```md
Before completion, verify every required manuscript artifact exists, is non-empty, and contains no placeholder sections. Record any major continuity or structure decision with `book_genesis_record_decision`.
```

In `prompts/book-genesis/revise.md`, add:

```md
Use the latest quality gate repair brief as the revision contract. Complete only after the revision log explains each repair and the manuscript artifacts have been updated.
```

In `prompts/book-genesis/deliver.md`, add:

```md
Use the ledger and latest passed quality gate to keep delivery materials consistent with the manuscript, positioning, and target reader.
```

- [ ] **Step 2: Improve status output**

In `formatRunStatus`, append quality and ledger fields:

```ts
lines.push(`Ledger: ${run.ledgerPath}`);
lines.push(`Revision cycle: ${run.revisionCycle}/${run.config.maxRevisionCycles}`);

const latestGate = run.qualityGates.at(-1);
if (latestGate) {
  lines.push(`Latest quality gate: ${latestGate.passed ? "passed" : "failed"} at threshold ${latestGate.threshold}`);
}
```

- [ ] **Step 3: Document configuration**

Add to `README.md`:

````md
## Configuration

Book Genesis reads `book-genesis.config.json` from the workspace root. `/book-genesis run --config ./path/to/config.json <idea>` can point at a different file.

```json
{
  "maxRetriesPerPhase": 1,
  "chapterBatchSize": 3,
  "qualityThreshold": 85,
  "maxRevisionCycles": 2,
  "researchDepth": "standard",
  "targetWordCount": 60000,
  "audience": "adult commercial fiction readers",
  "tone": "propulsive and emotionally grounded"
}
```
````

- [ ] **Step 4: Document autonomy features**

Add to `README.md`:

```md
## Autonomy Features

- Artifact validation blocks phase completion when required files are missing, empty, outside the run directory, or still contain placeholder text.
- Structured ledgers preserve sources and decisions in `.book-genesis/ledger.json` so later phases do not have to infer durable context from prose handoffs.
- Quality gates let the evaluation phase score the manuscript against the configured threshold. Failed gates route automatically to revision, and revision routes back to evaluation until the manuscript passes or reaches `maxRevisionCycles`.
```

- [ ] **Step 5: Document tests**

Add to `README.md`:

````md
## Development

```bash
npm install
npm test
npm run typecheck
```
````

- [ ] **Step 6: Run full verification**

Run:

```bash
npm test
npm run typecheck
git status --short
```

Expected: tests and typecheck pass. `git status --short` shows only the intended prompt, status, and README edits before commit.

- [ ] **Step 7: Commit**

```bash
git add prompts/book-genesis/*.md extensions/book-genesis/state.ts README.md
git commit -m "docs: describe autonomous quality controls"
```

### Task 9: Final Integration And Push

**Files:**
- Inspect all changed files

- [ ] **Step 1: Run the complete suite**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass and TypeScript succeeds.

- [ ] **Step 2: Inspect commit history**

Run:

```bash
git log --oneline --decorate -n 8
```

Expected: the task commits appear after the initial commit in this order:

```text
test: add runtime state harness
feat: validate phase artifacts
feat: add run configuration
feat: add kickoff intake
feat: add git hygiene automation
feat: add structured run ledgers
feat: add quality gates
docs: describe autonomous quality controls
```

- [ ] **Step 3: Push**

Run:

```bash
git push
```

Expected: `main` pushes to `origin/main`.

## Self-Review

- Spec coverage: artifact validation is covered by Task 2, explicit config by Task 3, kickoff intake by Task 4, git bootstrap and snapshot hygiene by Task 5, structured source and decision ledgers by Task 6, quality gates by Task 7, and test harness by Task 1.
- Type consistency: new types are introduced before use in the implementation tasks; `RunConfig`, `RunLedger`, `QualityGateInput`, and `ArtifactValidationResult` have one declared owner each.
- Scope check: this plan keeps the command surface stable and does not introduce external services, background workers, or a database.
- Verification coverage: each runtime feature has focused `node:test` coverage plus final `npm test` and `npm run typecheck`.
