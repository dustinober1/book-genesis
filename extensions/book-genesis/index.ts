import { existsSync } from "node:fs";
import path from "node:path";

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  approveRun,
  completeCurrentPhase,
  createRunState,
  findLatestRunDir,
  formatRunStatus,
  listRunDirs,
  markPhaseStarted,
  parseIdeaInput,
  readRunState,
  rejectRun,
  reportCurrentPhaseFailure,
  requestReviewerRevision,
  stopRun,
  stripQuotes,
  writeRunState,
} from "./state.js";
import { buildCompactionSummary, buildPhasePrompt, buildSystemPrompt, parseRunMarker } from "./prompts.js";
import { PHASE_ORDER, type PhaseName, type RunState } from "./types.js";
import { loadRunConfig } from "./config.js";
import { formatArtifactValidationReport, validatePhaseArtifacts } from "./artifacts.js";
import { upsertStoryBible } from "./bible.js";
import { writeExportPackage } from "./exports.js";
import { ensureWorkspaceGitRepo, snapshotRunProgress } from "./git.js";
import { validateKickoffIntake, writeKickoffBrief } from "./intake.js";
import { recordDecision, recordSource } from "./ledger.js";

const activeRunBySession = new Map<string, string>();

function getSessionKey(ctx: unknown) {
  return (ctx as { sessionManager?: { getSessionFile?: () => string } })?.sessionManager?.getSessionFile?.() ?? null;
}

function setActiveRunForContext(ctx: unknown, runDir: string) {
  const key = getSessionKey(ctx);
  if (key) {
    activeRunBySession.set(key, runDir);
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const text = (item as { text?: string }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function detectRunDirFromMessages(messages: unknown[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const marker = parseRunMarker(extractText((messages[index] as { content?: unknown }).content));
    if (marker?.run_dir) {
      return marker.run_dir;
    }
  }

  return null;
}

function resolveRunDir(arg: string, ctx: unknown, messages?: unknown[]) {
  const explicit = stripQuotes(arg);
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
  }

  const sessionKey = getSessionKey(ctx);
  if (sessionKey && activeRunBySession.has(sessionKey)) {
    return activeRunBySession.get(sessionKey) ?? null;
  }

  if (messages && messages.length > 0) {
    return detectRunDirFromMessages(messages);
  }

  return findLatestRunDir(process.cwd());
}

function parseSubcommand(args: string) {
  const trimmed = args.trim();
  if (!trimmed) {
    return { subcommand: "", rest: "" };
  }

  const [subcommand, ...rest] = trimmed.split(/\s+/);
  return {
    subcommand,
    rest: rest.join(" ").trim(),
  };
}

function parseRunArgs(args: string) {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const configIndex = tokens.indexOf("--config");
  if (configIndex === -1) {
    return { configPath: undefined as string | undefined, ideaInput: args };
  }

  const configPath = tokens[configIndex + 1];
  if (!configPath) {
    throw new Error("--config requires a path.");
  }

  const ideaTokens = tokens.filter((_, index) => index !== configIndex && index !== configIndex + 1);
  return { configPath, ideaInput: ideaTokens.join(" ") };
}

function consumeFirstArg(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return { first: "", rest: "" };
  }

  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const endIndex = trimmed.indexOf(quote, 1);
    if (endIndex !== -1) {
      return {
        first: trimmed.slice(1, endIndex),
        rest: trimmed.slice(endIndex + 1).trim(),
      };
    }
  }

  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) {
    return { first: trimmed, rest: "" };
  }

  return {
    first: trimmed.slice(0, firstSpace),
    rest: trimmed.slice(firstSpace).trim(),
  };
}

function isRunDirectoryCandidate(value: string) {
  const explicit = stripQuotes(value);
  if (!explicit) {
    return false;
  }

  const absolute = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
  return existsSync(path.join(absolute, ".book-genesis", "run.json"));
}

function parseRunDirAndNote(args: string, ctx: unknown, messages?: unknown[]) {
  const { first, rest } = consumeFirstArg(args);
  if (first && isRunDirectoryCandidate(first)) {
    return {
      runDir: resolveRunDir(first, ctx, messages),
      note: rest.trim(),
    };
  }

  return {
    runDir: resolveRunDir("", ctx, messages),
    note: args.trim(),
  };
}

function buildSessionName(run: RunState) {
  return `Book Genesis · ${run.slug} · ${run.currentPhase}`;
}

async function launchPhaseSession(
  pi: ExtensionAPI,
  ctx: {
    waitForIdle: () => Promise<void>;
    newSession: (options: unknown) => Promise<{ cancelled?: boolean } | void>;
    ui: { notify: (message: string, level: "info" | "error") => void };
  },
  run: RunState,
  note: string,
) {
  const latestEntry = run.history[run.history.length - 1];
  if (latestEntry?.phase === run.currentPhase && latestEntry.status === "running") {
    ctx.ui.notify(`Phase ${run.currentPhase} is already active for ${run.id}.`, "info");
    return;
  }

  markPhaseStarted(run, note);
  writeRunState(run);

  await ctx.waitForIdle();
  const prompt = buildPhasePrompt(run);
  const parentSession = (ctx as { sessionManager?: { getSessionFile?: () => string } }).sessionManager?.getSessionFile?.();
  const options: {
    parentSession?: string;
    setup: (sessionManager: {
      appendMessage: (message: {
        role: "user";
        content: Array<{ type: "text"; text: string }>;
        timestamp: number;
      }) => void;
    }) => Promise<void>;
  } = {
    setup: async (sessionManager) => {
      sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text: prompt }],
        timestamp: Date.now(),
      });
    },
  };

  if (parentSession) {
    options.parentSession = parentSession;
  }

  const result = await ctx.newSession(options);
  if (result && result.cancelled) {
    stopRun(run, `Session switch cancelled before ${run.currentPhase} phase.`);
    writeRunState(run);
    ctx.ui.notify(`Cancelled ${run.id} before ${run.currentPhase} phase.`, "info");
    return;
  }

  pi.setSessionName(buildSessionName(run));
  setActiveRunForContext(ctx, run.rootDir);
}

function sendStatus(pi: ExtensionAPI, content: string) {
  pi.sendMessage({
    customType: "book-genesis-status",
    content,
    display: true,
  });
}

export default function bookGenesisExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const marker = parseRunMarker(event.prompt ?? "");
    if (!marker?.run_dir) {
      return;
    }

    const run = readRunState(marker.run_dir);
    setActiveRunForContext(ctx, run.rootDir);

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildSystemPrompt(run)}`,
    };
  });

  pi.on("context", async (event, ctx) => {
    const runDir = resolveRunDir("", ctx, event.messages as unknown[]);
    if (!runDir) {
      return;
    }

    const pinned: unknown[] = [];
    const recent: unknown[] = [];

    for (const message of event.messages as unknown[]) {
      const text = extractText((message as { content?: unknown }).content);
      if (text.includes("<book_genesis_run>")) {
        pinned.push(message);
        continue;
      }

      recent.push(message);
    }

    if (recent.length <= 12) {
      return { messages: [...pinned, ...recent] };
    }

    return {
      messages: [...pinned, ...recent.slice(-12)],
    };
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    const sessionKey = getSessionKey(ctx);
    const runDir = sessionKey ? activeRunBySession.get(sessionKey) : null;
    if (!runDir) {
      return;
    }

    const run = readRunState(runDir);
    return {
      compaction: {
        summary: buildCompactionSummary(run),
      },
    };
  });

  pi.registerCommand("book-genesis", {
    description: "Manage autonomous Book Genesis runs: /book-genesis run|resume|status|stop|approve|reject|feedback|list-runs|export",
    getArgumentCompletions: (prefix: string) => {
      const parts = prefix.trim().split(/\s+/);
      if (parts.length <= 1) {
        return ["run", "resume", "status", "stop", "approve", "reject", "feedback", "list-runs", "export"]
          .filter((item) => item.startsWith(parts[0] ?? ""))
          .map((item) => ({ value: item, label: item }));
      }

      return [];
    },
    handler: async (args: string, ctx: any) => {
      const { subcommand, rest } = parseSubcommand(args);

      switch (subcommand) {
        case "run": {
          let configPath: string | undefined;
          let ideaInput = rest;
          try {
            ({ configPath, ideaInput } = parseRunArgs(rest));
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
            return;
          }

          const parsed = parseIdeaInput(ideaInput);
          if (!parsed.idea) {
            ctx.ui.notify("Usage: /book-genesis run [language] <idea>", "error");
            return;
          }

          const config = loadRunConfig(process.cwd(), configPath);
          const gitStatus = ensureWorkspaceGitRepo(process.cwd(), config);
          const run = createRunState(process.cwd(), ideaInput, config);
          run.git = {
            repoRoot: gitStatus.repoRoot,
            initializedByRuntime: gitStatus.initialized,
          };
          writeRunState(run);
          ctx.ui.notify(`Created run ${run.id}. Launching ${run.currentPhase}.`, "info");
          await launchPhaseSession(pi, ctx, run, `Starting run for idea: ${run.idea}`);
          return;
        }

        case "resume": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          if (run.status === "completed") {
            sendStatus(pi, formatRunStatus(run));
            return;
          }

          if (run.status === "awaiting_approval") {
            ctx.ui.notify(`Run ${run.id} is waiting for approval. Use /book-genesis approve or reject.`, "info");
            sendStatus(pi, formatRunStatus(run));
            return;
          }

          if (run.stopRequested) {
            run.stopRequested = false;
            run.status = "running";
            run.nextAction = `Resume ${run.currentPhase} phase.`;
            writeRunState(run);
          }

          await launchPhaseSession(pi, ctx, run, `Resuming ${run.currentPhase} phase.`);
          return;
        }

        case "status": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          sendStatus(pi, formatRunStatus(readRunState(runDir)));
          return;
        }

        case "approve": {
          const { runDir, note } = parseRunDirAndNote(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          try {
            approveRun(run, note);
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
            return;
          }

          writeRunState(run);
          if (run.status === "completed") {
            sendStatus(pi, formatRunStatus(run));
            return;
          }

          await launchPhaseSession(pi, ctx, run, `Approval received after ${run.approval?.phase ?? "checkpoint"}.`);
          return;
        }

        case "reject": {
          const { runDir, note } = parseRunDirAndNote(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          try {
            rejectRun(run, note);
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
            return;
          }

          writeRunState(run);
          sendStatus(pi, formatRunStatus(run));
          return;
        }

        case "feedback": {
          const { runDir, note } = parseRunDirAndNote(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          if (!note.trim()) {
            ctx.ui.notify("Usage: /book-genesis feedback [run-dir] <reviewer feedback>", "error");
            return;
          }

          const run = readRunState(runDir);
          try {
            requestReviewerRevision(run, note);
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
            return;
          }

          writeRunState(run);
          await launchPhaseSession(pi, ctx, run, "Reviewer feedback received. Rework the manuscript against the latest notes.");
          return;
        }

        case "list-runs": {
          const runs = listRunDirs(process.cwd());
          if (runs.length === 0) {
            sendStatus(pi, "No Book Genesis runs found.");
            return;
          }

          sendStatus(pi, runs.map((dir) => formatRunStatus(readRunState(dir))).join("\n\n---\n\n"));
          return;
        }

        case "export": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          const manifest = await writeExportPackage(run);
          writeRunState(run);
          sendStatus(pi, `Exported ${manifest.files.length} files for ${run.id}.\n${manifest.files.join("\n")}`);
          return;
        }

        case "stop": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          stopRun(run, "Stopped by /book-genesis stop.");
          writeRunState(run);
          sendStatus(pi, formatRunStatus(run));
          return;
        }

        default:
          ctx.ui.notify("Usage: /book-genesis run|resume|status|stop|approve|reject|feedback|list-runs|export ...", "info");
      }
    },
  });

  pi.registerCommand("book-auto", {
    description: "Compatibility alias for /book-genesis run",
    handler: async (args: string, ctx: any) => {
      let configPath: string | undefined;
      let ideaInput = args;
      try {
        ({ configPath, ideaInput } = parseRunArgs(args));
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
        return;
      }

      const parsed = parseIdeaInput(ideaInput);
      if (!parsed.idea) {
        ctx.ui.notify("Usage: /book-auto [language] <idea>", "error");
        return;
      }

      const config = loadRunConfig(process.cwd(), configPath);
      const gitStatus = ensureWorkspaceGitRepo(process.cwd(), config);
      const run = createRunState(process.cwd(), ideaInput, config);
      run.git = {
        repoRoot: gitStatus.repoRoot,
        initializedByRuntime: gitStatus.initialized,
      };
      writeRunState(run);
      ctx.ui.notify(`Created run ${run.id}. Launching ${run.currentPhase}.`, "info");
      await launchPhaseSession(pi, ctx, run, `Starting run for idea: ${run.idea}`);
    },
  });

  pi.registerTool({
    name: "book_genesis_complete_kickoff",
    label: "Book Genesis Complete Kickoff",
    description: "Record kickoff intake answers, write the project brief, and advance to research.",
    promptSnippet: "Use this once the human has provided enough kickoff information to start autonomous research.",
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
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

      const kickoffSnapshot = snapshotRunProgress(run, "kickoff", run.config.gitCommitPaths);
      if (kickoffSnapshot.createdCommit) {
        writeRunState(run);
      }

      if (run.status !== "stopped") {
        pi.sendUserMessage(`/book-genesis resume "${run.rootDir}"`, { deliverAs: "followUp" });
      }

      return { content: [{ type: "text", text: "Kickoff complete. Research queued." }] };
    },
  });

  pi.registerTool({
    name: "book_genesis_update_story_bible",
    label: "Book Genesis Update Story Bible",
    description: "Persist durable book memory for characters, settings, promises, motifs, and continuity facts.",
    promptSnippet: "Use this whenever the active phase establishes facts later phases must preserve.",
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      premise: Type.Optional(Type.String()),
      themes: Type.Optional(Type.Array(Type.String())),
      promises: Type.Optional(Type.Array(Type.String())),
      motifs: Type.Optional(Type.Array(Type.String())),
      characters: Type.Optional(Type.Array(Type.Object({
        id: Type.String(),
        name: Type.String(),
        role: Type.String(),
        desire: Type.String(),
        fear: Type.Optional(Type.String()),
        notes: Type.Optional(Type.Array(Type.String())),
      }))),
      relationships: Type.Optional(Type.Array(Type.Object({
        from: Type.String(),
        to: Type.String(),
        dynamic: Type.String(),
        pressure: Type.Optional(Type.String()),
      }))),
      settings: Type.Optional(Type.Array(Type.Object({
        name: Type.String(),
        function: Type.String(),
        rules: Type.Array(Type.String()),
      }))),
      timeline: Type.Optional(Type.Array(Type.Object({
        point: Type.String(),
        event: Type.String(),
        consequence: Type.Optional(Type.String()),
      }))),
      glossary: Type.Optional(Type.Array(Type.Object({
        term: Type.String(),
        definition: Type.String(),
      }))),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [{ type: "text", text: `Run is on phase ${run.currentPhase}, not ${params.phase}.` }],
        };
      }

      if (!run.config.storyBibleEnabled) {
        return {
          isError: true,
          content: [{ type: "text", text: "Story bible is disabled for this run." }],
        };
      }

      upsertStoryBible(run, {
        premise: params.premise,
        themes: params.themes,
        promises: params.promises,
        motifs: params.motifs,
        characters: params.characters,
        relationships: params.relationships,
        settings: params.settings,
        timeline: params.timeline,
        glossary: params.glossary,
      });
      writeRunState(run);

      return { content: [{ type: "text", text: "Updated Book Genesis story bible." }] };
    },
  });

  pi.registerTool({
    name: "book_genesis_record_source",
    label: "Book Genesis Record Source",
    description: "Record a source used by the active Book Genesis run.",
    promptSnippet: "Use this when research or evaluation depends on a concrete source.",
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      title: Type.String(),
      url: Type.Optional(Type.String()),
      summary: Type.String(),
      usefulness: Type.String(),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [{ type: "text", text: `Run is on phase ${run.currentPhase}, not ${params.phase}.` }],
        };
      }

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

  pi.registerTool({
    name: "book_genesis_record_decision",
    label: "Book Genesis Record Decision",
    description: "Record a durable creative or strategic decision for the active Book Genesis run.",
    promptSnippet: "Use this when a phase makes a decision later phases should preserve.",
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      decision: Type.String(),
      rationale: Type.String(),
      impact: Type.String(),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [{ type: "text", text: `Run is on phase ${run.currentPhase}, not ${params.phase}.` }],
        };
      }

      recordDecision(run, {
        phase: params.phase,
        decision: params.decision,
        rationale: params.rationale,
        impact: params.impact,
      });

      return { content: [{ type: "text", text: "Recorded Book Genesis decision." }] };
    },
  });

  pi.registerTool({
    name: "book_genesis_complete_phase",
    label: "Book Genesis Complete Phase",
    description: "Mark the current Book Genesis phase complete, persist the handoff, and queue the next phase.",
    promptSnippet: "Use this exactly once when the active Book Genesis phase is complete.",
    promptGuidelines: [
      "Always include real artifact paths that were created or updated during the phase.",
      "If the phase cannot complete, use book_genesis_report_failure instead.",
    ],
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      summary: Type.String({ description: "What was completed in this phase" }),
      artifacts: Type.Optional(Type.Array(Type.String({ description: "Artifact file or directory path" }))),
      unresolved_issues: Type.Optional(Type.Array(Type.String({ description: "Anything still unresolved" }))),
      quality_gate: Type.Optional(Type.Object({
        threshold: Type.Number(),
        scores: Type.Object({
          marketFit: Type.Number(),
          structure: Type.Number(),
          prose: Type.Number(),
          consistency: Type.Number(),
          deliveryReadiness: Type.Number(),
          pacing: Type.Optional(Type.Number()),
          payoff: Type.Optional(Type.Number()),
          clarity: Type.Optional(Type.Number()),
          authority: Type.Optional(Type.Number()),
          vulnerability: Type.Optional(Type.Number()),
          reflection: Type.Optional(Type.Number()),
          credibility: Type.Optional(Type.Number()),
          narrativeDrive: Type.Optional(Type.Number()),
          ageFit: Type.Optional(Type.Number()),
          readAloudRhythm: Type.Optional(Type.Number()),
        }),
        repairBrief: Type.String(),
      })),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (params.phase === "kickoff") {
        return {
          isError: true,
          content: [{ type: "text", text: "Use book_genesis_complete_kickoff for the kickoff phase." }],
        };
      }

      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Run is on phase ${run.currentPhase}, not ${params.phase}.`,
            },
          ],
        };
      }

      if (params.phase === "evaluate" && !params.quality_gate) {
        return {
          isError: true,
          content: [{ type: "text", text: "Evaluate phase requires quality_gate." }],
        };
      }

      const artifacts = params.artifacts ?? [];
      const validation = validatePhaseArtifacts(run, params.phase as PhaseName, artifacts);
      if (!validation.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: formatArtifactValidationReport(validation) }],
        };
      }

      completeCurrentPhase(run, {
        summary: params.summary,
        artifacts,
        unresolvedIssues: params.unresolved_issues ?? [],
        qualityGate: params.quality_gate,
      });
      writeRunState(run);

      const snapshot = snapshotRunProgress(run, params.phase as PhaseName, run.config.gitCommitPaths);
      if (snapshot.createdCommit) {
        writeRunState(run);
      }

      if (run.status === "completed") {
        return {
          content: [
            {
              type: "text",
              text: `Run ${run.id} is complete. Delivery artifacts are ready in ${run.rootDir}.`,
            },
          ],
        };
      }

      if (run.status !== "stopped") {
        pi.sendUserMessage(`/book-genesis resume "${run.rootDir}"`, { deliverAs: "followUp" });
      }

      return {
        content: [
          {
            type: "text",
            text: `Recorded ${params.phase} completion. Next phase: ${run.currentPhase}.`,
          },
        ],
      };
    },
  });

  pi.registerTool({
    name: "book_genesis_report_failure",
    label: "Book Genesis Report Failure",
    description: "Record a failed phase, retry once when appropriate, or stop the run cleanly.",
    promptSnippet: "Use this when the active Book Genesis phase cannot be completed successfully.",
    promptGuidelines: [
      "Set retryable to true only for transient tool or provider failures.",
      "Be precise about the blocker so resume logic has a trustworthy handoff.",
    ],
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      reason: Type.String({ description: "Why the phase failed" }),
      retryable: Type.Boolean({ description: "Whether the runtime should retry this phase once" }),
      unresolved_issues: Type.Optional(Type.Array(Type.String({ description: "Open issues to preserve" }))),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Run is on phase ${run.currentPhase}, not ${params.phase}.`,
            },
          ],
        };
      }

      const outcome = reportCurrentPhaseFailure(run, {
        reason: params.reason,
        retryable: params.retryable,
        unresolvedIssues: params.unresolved_issues ?? [],
      });
      writeRunState(run);

      if (outcome.shouldRetry) {
        pi.sendUserMessage(`/book-genesis resume "${run.rootDir}"`, { deliverAs: "followUp" });
      }

      return {
        isError: !outcome.shouldRetry,
        content: [
          {
            type: "text",
            text: outcome.shouldRetry
              ? `Recorded transient failure for ${params.phase}. Retry queued.`
              : `Recorded failure for ${params.phase}. Manual resume required.`,
          },
        ],
      };
    },
  });

  pi.registerTool({
    name: "book_genesis_compact_context",
    label: "Book Genesis Compact Context",
    description: "Trigger compaction with Book Genesis-specific instructions.",
    promptSnippet: "Use this when a Book Genesis phase has accumulated too much context.",
    parameters: Type.Object({
      focus: Type.Optional(Type.String({ description: "What the compaction summary should emphasize" })),
    }),
    async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) {
      const focus = params.focus?.trim() || "Keep the active Book Genesis phase, artifacts, and next action.";
      ctx.compact({
        customInstructions: focus,
      });

      return {
        content: [
          {
            type: "text",
            text: "Requested Book Genesis compaction.",
          },
        ],
      };
    },
  });
}
