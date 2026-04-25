import path from "node:path";

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  completeCurrentPhase,
  createRunState,
  findLatestRunDir,
  formatRunStatus,
  markPhaseStarted,
  parseIdeaInput,
  readRunState,
  reportCurrentPhaseFailure,
  stopRun,
  stripQuotes,
  writeRunState,
} from "./state.js";
import { buildCompactionSummary, buildPhasePrompt, buildSystemPrompt, parseRunMarker } from "./prompts.js";
import { PHASE_ORDER, type PhaseName, type RunState } from "./types.js";

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
    description: "Manage autonomous Book Genesis runs: /book-genesis run|resume|status|stop",
    getArgumentCompletions: (prefix: string) => {
      const parts = prefix.trim().split(/\s+/);
      if (parts.length <= 1) {
        return ["run", "resume", "status", "stop"]
          .filter((item) => item.startsWith(parts[0] ?? ""))
          .map((item) => ({ value: item, label: item }));
      }

      return [];
    },
    handler: async (args: string, ctx: any) => {
      const { subcommand, rest } = parseSubcommand(args);

      switch (subcommand) {
        case "run": {
          const parsed = parseIdeaInput(rest);
          if (!parsed.idea) {
            ctx.ui.notify("Usage: /book-genesis run [language] <idea>", "error");
            return;
          }

          const run = createRunState(process.cwd(), rest);
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
          ctx.ui.notify("Usage: /book-genesis run|resume|status|stop ...", "info");
      }
    },
  });

  pi.registerCommand("book-auto", {
    description: "Compatibility alias for /book-genesis run",
    handler: async (args: string, ctx: any) => {
      const parsed = parseIdeaInput(args);
      if (!parsed.idea) {
        ctx.ui.notify("Usage: /book-auto [language] <idea>", "error");
        return;
      }

      const run = createRunState(process.cwd(), args);
      writeRunState(run);
      ctx.ui.notify(`Created run ${run.id}. Launching ${run.currentPhase}.`, "info");
      await launchPhaseSession(pi, ctx, run, `Starting run for idea: ${run.idea}`);
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

      completeCurrentPhase(run, {
        summary: params.summary,
        artifacts: params.artifacts ?? [],
        unresolvedIssues: params.unresolved_issues ?? [],
      });
      writeRunState(run);

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
