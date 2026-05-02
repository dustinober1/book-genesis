import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { buildAuditReport, formatAuditReport } from "./audit.js";
import { writeArchive } from "./archive.js";
import { writeBetaReaderPacket, type BetaSampleMode } from "./beta-packet.js";
import { writeBibleCheck } from "./bible-check.js";
import { upsertStoryBible } from "./bible.js";
import { writeBookMatter } from "./book-matter.js";
import { STARTER_CONFIG_MODES, writeStarterConfig } from "./config-init.js";
import { buildAutoContinuePrompt } from "./continuation.js";
import { writeCoverCheck } from "./cover-check.js";
import { writeCritiquePanel } from "./critique.js";
import { recommendNextAction, writeRunDashboard } from "./dashboard.js";
import { buildDoctorReport, formatDoctorReport } from "./doctor.js";
import { buildRunDoctorReport, formatRunDoctorReport } from "./doctor-run.js";
import { writeExportPackage } from "./exports.js";
import { buildFinalCheck, finalCheckWarning, formatFinalCheck, writeFinalCheck } from "./final-check.js";
import { ensureWorkspaceGitRepo, snapshotRunProgress } from "./git.js";
import { validateKickoffIntake, writeKickoffBrief } from "./intake.js";
import { compareDrafts, requestChapterRevision, requestWriteSampleCheckpoint } from "./interventions.js";
import { writeManuscriptIntelligenceReport } from "./intelligence.js";
import { writeKdpPackage } from "./kdp.js";
import { writeLayoutProfileReport } from "./layout-profiles.js";
import { writeLaunchKit } from "./launch.js";
import { recordDecision, recordSource } from "./ledger.js";
import { writeMetadataLab } from "./metadata-lab.js";
import { buildShortStoryBrainstorm, writeShortStoryPackage } from "./promotion.js";
import { writeRevisionBoard } from "./revision-board.js";
import { approveRevisionPlan, createRevisionPlan, rejectRevisionPlan } from "./revision-plan.js";
import { writePacingDashboard, writeSceneMap } from "./scenes.js";
import { buildRunStats, formatRunStats } from "./stats.js";
import { addSourceToLedger, writeSourcePack } from "./source-pack.js";
import { addVaultSource, linkClaimToSources, writeSourceVault } from "./source-vault.js";
import { writeStyleLint, writeStyleProfile } from "./style.js";
import { writeSourceAudit } from "./source-audit.js";
import { chooseVariant, generateVariants } from "./variants.js";
import { writeProjectMap } from "./project-map.js";
import { writeRevisionHistory } from "./revision-history.js";
import { fetchResearchUrl, formatSearchResults, searchInternet } from "./research-web.js";
import { readIndependentEvaluationScores, scoreDisagreement } from "./evaluation.js";

const activeRunBySession = new Map<string, string>();
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(MODULE_DIR, "../..");

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

function resolveMigrationsRunDir(currentDir: string, candidate: string, ctx: unknown, messages?: unknown[]) {
  const resolved = resolveRunDir(candidate, ctx, messages);
  if (resolved) {
    return resolved;
  }

  const localRunStatePath = path.join(currentDir, ".book-genesis", "run.json");
  if (existsSync(localRunStatePath)) {
    return currentDir;
  }

  return null;
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

function parseOptionalRunDirAndRest(args: string, ctx: unknown, messages?: unknown[]) {
  const { first, rest } = consumeFirstArg(args);
  if (first && isRunDirectoryCandidate(first)) {
    return {
      runDir: resolveRunDir(first, ctx, messages),
      rest,
    };
  }

  return {
    runDir: resolveRunDir("", ctx, messages),
    rest: args.trim(),
  };
}

function parseJsonFlag(args: string) {
  return {
    json: args.split(/\s+/).includes("--json"),
    rest: args.replace(/(^|\s)--json(?=\s|$)/g, " ").trim(),
  };
}

function parseFlagValue(args: string, flag: string) {
  const match = args.match(new RegExp(`(?:^|\\s)${flag}\\s+(\\S+)(?=\\s|$)`));
  return match?.[1];
}

function parseTextFlag(args: string, flag: string) {
  const index = args.split(/\s+/).findIndex((token) => token === flag);
  if (index === -1) return undefined;
  const before = args.split(/\s+/).slice(0, index + 1).join(" ");
  const start = before.length;
  const parsed = consumeFirstArg(args.slice(start).trim());
  return parsed.first || undefined;
}

function removeFlag(args: string, flag: string) {
  return args.replace(new RegExp(`(^|\\s)${flag}(?=\\s|$)`, "g"), " ").trim();
}

function removeFlagValue(args: string, flag: string) {
  return args.replace(new RegExp(`(^|\\s)${flag}\\s+\\S+(?=\\s|$)`, "g"), " ").trim();
}

function removeTextFlag(args: string, flag: string) {
  const value = parseTextFlag(args, flag);
  if (!value) return args;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return args.replace(new RegExp(`(^|\\s)${flag}\\s+["']?${escaped}["']?(?=\\s|$)`), " ").trim();
}

function parseSampleCount(args: string) {
  const match = args.match(/(?:^|\s)--sample\s+(\d+)(?=\s|$)/);
  if (!match) {
    throw new Error("Usage: /book-genesis checkpoint write [run-dir] --sample <n>");
  }
  return Number(match[1]);
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

  pi.on("session_compact", async (_event, ctx) => {
    const sessionKey = getSessionKey(ctx);
    const runDir = sessionKey ? activeRunBySession.get(sessionKey) : null;
    if (!runDir) {
      return;
    }

    const run = readRunState(runDir);
    if (run.status !== "running") {
      return;
    }

    pi.sendUserMessage(buildAutoContinuePrompt(run, "session auto-compacted"), { deliverAs: "followUp" });
  });

  pi.registerCommand("book-genesis", {
    description: "Manage autonomous Book Genesis runs.",
    getArgumentCompletions: (prefix: string) => {
      const parts = prefix.trim().split(/\s+/);
      if (parts.length <= 1) {
        return ["run", "resume", "status", "next", "dashboard", "map", "doctor-run", "stop", "approve", "reject", "feedback", "feedback-plan", "approve-revision-plan", "reject-revision-plan", "list-runs", "export", "kdp", "audit", "final-check", "doctor", "open", "stats", "init-config", "metadata-lab", "revision-board", "layout-profile", "style-profile", "style-lint", "scene-map", "pacing", "critique-panel", "source-audit", "source", "source-pack", "source-vault", "revision-history", "bible-check", "beta-packet", "variants", "choose-variant", "launch-kit", "book-matter", "cover-check", "archive", "revise-chapter", "inspect-continuity", "checkpoint", "compare-drafts", "short-story", "migrate"]
          .filter((item) => item.startsWith(parts[0] ?? ""))
          .map((item) => ({ value: item, label: item }));
      }

      if (parts[0] === "init-config") {
        return STARTER_CONFIG_MODES.filter((item) => item.startsWith(parts[1] ?? "")).map((item) => ({ value: item, label: item }));
      }

      return [];
    },
    handler: async (args: string, ctx: any) => {
      const { subcommand, rest } = parseSubcommand(args);

      switch (subcommand) {
        case "init-config": {
          const force = rest.split(/\s+/).includes("--force");
          const preset = parseFlagValue(rest, "--preset");
          const mode = removeFlagValue(rest.replace(/(^|\s)--force(?=\s|$)/g, " "), "--preset").trim() || "fiction";
          try {
            const result = writeStarterConfig(process.cwd(), mode as any, force, preset);
            sendStatus(pi, `Starter config written.\n${result.configPath}\n${result.guidePath}`);
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
          }
          return;
        }

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

        case "next": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const next = recommendNextAction(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(next, null, 2) : `${next.command}\n${next.reason}`);
          return;
        }

        case "dashboard": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeRunDashboard(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(result.dashboard, null, 2) : `Dashboard written.\n${result.markdownPath}\n${result.jsonPath}`);
          return;
        }

        case "map": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeProjectMap(readRunState(runDir));
          sendStatus(pi, `Project map written.\n${result.markdownPath}`);
          return;
        }

        case "doctor-run": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const report = buildRunDoctorReport(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(report, null, 2) : formatRunDoctorReport(report));
          return;
        }

        case "migrate": {
          const trimmed = rest.trim();
          if (trimmed === "--all") {
            const runs = listRunDirs(process.cwd());
            if (runs.length === 0) {
              const currentDirRun = resolveMigrationsRunDir(process.cwd(), "", ctx, undefined);
              if (!currentDirRun) {
                sendStatus(pi, "No Book Genesis runs found to migrate.");
                return;
              }

              const run = readRunState(currentDirRun);
              sendStatus(pi, `Migration complete for ${run.id}. Run is now version ${run.version}.`);
              return;
            }

            const lines = ["Migration complete."];
            for (const runDir of runs) {
              const run = readRunState(runDir);
              lines.push(`- ${run.id}: version ${run.version}`);
            }

            sendStatus(pi, lines.join("\n"));
            return;
          }

          const runDir = resolveMigrationsRunDir(process.cwd(), trimmed, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          sendStatus(pi, `Migration complete for ${run.id}. Run is now version ${run.version}.`);
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
          if (run.config.revisionPlan.requirePlanBeforeRewrite) {
            ctx.ui.notify("Revision plans are required for this run. Use /book-genesis feedback-plan [run-dir] <reviewer feedback>.", "info");
          }
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

        case "feedback-plan": {
          const { runDir, note } = parseRunDirAndNote(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(runDir);
          try {
            const plan = createRevisionPlan(run, note);
            writeRunState(run);
            sendStatus(pi, `Revision plan created.\n${plan.planPath}`);
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
          }
          return;
        }

        case "approve-revision-plan": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(runDir);
          try {
            approveRevisionPlan(run);
            writeRunState(run);
            await launchPhaseSession(pi, ctx, run, "Approved revision plan.");
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
          }
          return;
        }

        case "reject-revision-plan": {
          const { runDir, note } = parseRunDirAndNote(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(runDir);
          try {
            rejectRevisionPlan(run, note);
            writeRunState(run);
            sendStatus(pi, formatRunStatus(run));
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
          }
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
          writeRunDashboard(run);
          const warning = finalCheckWarning(run);
          sendStatus(pi, [`Exported ${manifest.files.length} files for ${run.id}.`, warning, ...manifest.files].filter(Boolean).join("\n"));
          return;
        }

        case "book-matter": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeBookMatter(readRunState(runDir));
          writeRunDashboard(readRunState(runDir));
          sendStatus(pi, `Book matter written.\n${[...result.frontFiles, ...result.backFiles, result.seriesPath].filter(Boolean).join("\n")}`);
          return;
        }

        case "kdp": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          const manifest = await writeKdpPackage(run);
          writeRunState(run);
          writeRunDashboard(run);
          const errorCount = manifest.issues.filter((issue) => issue.severity === "error").length;
          const warningCount = manifest.issues.filter((issue) => issue.severity === "warning").length;
          const warning = finalCheckWarning(run);
          sendStatus(
            pi,
            [`Prepared KDP package for ${run.id} with ${manifest.files.length} files, ${errorCount} errors, and ${warningCount} warnings.`, warning, ...manifest.files].filter(Boolean).join("\n"),
          );
          return;
        }

        case "audit": {
          const parsedAudit = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsedAudit.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }

          const run = readRunState(runDir);
          const report = buildAuditReport(run);
          sendStatus(pi, parsedAudit.json ? JSON.stringify(report, null, 2) : formatAuditReport(report));
          return;
        }

        case "final-check": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeFinalCheck(readRunState(runDir));
          writeRunDashboard(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(result.report, null, 2) : formatFinalCheck(result.report));
          return;
        }

        case "metadata-lab": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeMetadataLab(readRunState(runDir));
          writeRunDashboard(readRunState(runDir));
          sendStatus(pi, `Metadata lab written.\n- Markdown: ${result.markdownPath}\n- Scorecard: ${result.jsonPath}`);
          return;
        }

        case "revision-board": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeRevisionBoard(readRunState(runDir));
          writeRunDashboard(readRunState(runDir));
          sendStatus(pi, `Revision board written.\n${result.markdownPath}\n${result.jsonPath}`);
          return;
        }

        case "layout-profile": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeLayoutProfileReport(readRunState(runDir));
          sendStatus(pi, `Layout profile written.\n${result.markdownPath}\n${result.jsonPath}`);
          return;
        }

        case "revision-history": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeRevisionHistory(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(result.history, null, 2) : `Revision history written.\n${result.mdPath}\n${result.jsonPath}`);
          return;
        }

        case "bible-check": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeBibleCheck(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(result.report, null, 2) : `Bible check written.\n${result.mdPath}\n${result.jsonPath}`);
          return;
        }

        case "source-pack": {
          const parsed = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsed.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeSourcePack(readRunState(runDir));
          writeRunDashboard(readRunState(runDir));
          sendStatus(pi, parsed.json ? JSON.stringify(result.pack, null, 2) : `Source pack written.\n${result.mdPath}\n${result.jsonPath}\n${result.gapPlanPath}`);
          return;
        }

        case "source": {
          const action = parseSubcommand(rest);
          if (action.subcommand !== "add") {
            ctx.ui.notify("Usage: /book-genesis source add [run-dir] <title> --summary <text> [--url <url>]", "error");
            return;
          }
          const summary = parseTextFlag(action.rest, "--summary");
          const url = parseTextFlag(action.rest, "--url");
          const cleanRest = removeTextFlag(removeTextFlag(action.rest, "--summary"), "--url");
          const parsed = parseOptionalRunDirAndRest(cleanRest, ctx);
          if (!parsed.runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const { first: title } = consumeFirstArg(parsed.rest);
          if (!title || !summary) {
            ctx.ui.notify("Usage: /book-genesis source add [run-dir] <title> --summary <text> [--url <url>]", "error");
            return;
          }
          addSourceToLedger(readRunState(parsed.runDir), { title, summary, url });
          sendStatus(pi, `Source recorded: ${title}`);
          return;
        }

        case "source-vault": {
          const action = parseSubcommand(rest);
          if (action.subcommand === "add") {
            const parsed = parseOptionalRunDirAndRest(action.rest, ctx);
            if (!parsed.runDir) {
              ctx.ui.notify("No run directory provided and no active run found.", "error");
              return;
            }
            const titleArg = consumeFirstArg(parsed.rest);
            const urlArg = consumeFirstArg(titleArg.rest);
            const summaryArg = consumeFirstArg(urlArg.rest);
            if (!titleArg.first || !summaryArg.first) {
              ctx.ui.notify("Usage: /book-genesis source-vault add [run-dir] <title> <url> <summary>", "error");
              return;
            }
            const source = addVaultSource(readRunState(parsed.runDir), {
              title: titleArg.first,
              url: urlArg.first,
              summary: summaryArg.first,
              confidence: "medium",
            });
            sendStatus(pi, `Source vault entry recorded: ${source.id}`);
            return;
          }

          if (action.subcommand === "claim") {
            const parsed = parseOptionalRunDirAndRest(action.rest, ctx);
            if (!parsed.runDir) {
              ctx.ui.notify("No run directory provided and no active run found.", "error");
              return;
            }
            const claimArg = consumeFirstArg(parsed.rest);
            const sourceArg = consumeFirstArg(claimArg.rest);
            if (!claimArg.first || !sourceArg.first) {
              ctx.ui.notify("Usage: /book-genesis source-vault claim [run-dir] <claim> <source-id[,source-id]>", "error");
              return;
            }
            const claim = linkClaimToSources(readRunState(parsed.runDir), {
              claim: claimArg.first,
              sourceIds: sourceArg.first.split(",").map((entry) => entry.trim()).filter(Boolean),
              confidence: "medium",
            });
            sendStatus(pi, `Source vault claim linked: ${claim.claimId}`);
            return;
          }

          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeSourceVault(readRunState(runDir));
          sendStatus(pi, `Source vault written.\n${result.markdownPath}\n${result.jsonPath}`);
          return;
        }

        case "beta-packet": {
          const sample = (parseFlagValue(rest, "--sample") ?? "full") as BetaSampleMode;
          if (!["full", "first-3", "first-5"].includes(sample)) {
            ctx.ui.notify("Usage: /book-genesis beta-packet [run-dir] [--sample full|first-3|first-5]", "error");
            return;
          }
          const runDir = resolveRunDir(removeFlagValue(rest, "--sample"), ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = writeBetaReaderPacket(readRunState(runDir), sample);
          sendStatus(pi, `Beta reader packet written.\n${[...result.files, result.jsonPath].join("\n")}`);
          return;
        }

        case "doctor": {
          const parsedDoctor = parseJsonFlag(rest);
          const fix = parsedDoctor.rest.split(/\s+/).includes("--fix");
          const mode = STARTER_CONFIG_MODES.find((entry) => parsedDoctor.rest.split(/\s+/).includes(entry));
          const report = buildDoctorReport({
            workspaceRoot: process.cwd(),
            packageRoot: PACKAGE_ROOT,
            fix,
            mode,
          });
          sendStatus(pi, parsedDoctor.json ? JSON.stringify(report, null, 2) : formatDoctorReport(report));
          return;
        }

        case "open": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(runDir);
          const paths = [
            ["run root", run.rootDir],
            ["run state", run.statePath],
            ["ledger", run.ledgerPath],
            ["story bible", run.storyBiblePath ?? path.join(run.rootDir, "foundation", "story-bible.md")],
            ["full manuscript", path.join(run.rootDir, "manuscript", "full-manuscript.md")],
            ["latest evaluation", path.join(run.rootDir, "evaluations", "genesis-score.md")],
            ["latest audit", path.join(run.rootDir, "evaluations", "audit.md")],
            ["export manifest", run.lastExportManifestPath ?? path.join(run.rootDir, "delivery", "export-manifest.json")],
            ["KDP manifest", run.lastKdpPackageManifestPath ?? path.join(run.rootDir, "delivery", "kdp", "kdp-package-manifest.json")],
            ["launch kit manifest", path.join(run.rootDir, "promotion", "launch-kit", "launch-kit-manifest.json")],
          ];
          sendStatus(pi, paths.map(([label, value]) => `- ${label}: ${value}`).join("\n"));
          return;
        }

        case "stats": {
          const parsedStats = parseJsonFlag(rest);
          const runDir = resolveRunDir(parsedStats.rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const stats = buildRunStats(readRunState(runDir));
          sendStatus(pi, parsedStats.json ? JSON.stringify(stats, null, 2) : formatRunStats(stats));
          return;
        }

        case "style-profile":
        case "style-lint":
        case "scene-map":
        case "pacing":
        case "critique-panel":
        case "source-audit":
        case "launch-kit":
        case "archive": {
          const parsed = parseJsonFlag(rest);
          const manifestOnly = parsed.rest.split(/\s+/).includes("--manifest-only");
          const cleanRest = removeFlag(parsed.rest, "--manifest-only");
          const runDir = resolveRunDir(cleanRest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(runDir);
          const result =
            subcommand === "style-profile" ? writeStyleProfile(run)
            : subcommand === "style-lint" ? writeStyleLint(run)
            : subcommand === "scene-map" ? writeSceneMap(run)
            : subcommand === "pacing" ? writePacingDashboard(run)
            : subcommand === "critique-panel" ? writeCritiquePanel(run)
            : subcommand === "source-audit" ? writeSourceAudit(run)
            : subcommand === "launch-kit" ? writeLaunchKit(run)
            : writeArchive(run, manifestOnly);
          writeRunDashboard(run);
          sendStatus(pi, parsed.json ? JSON.stringify(result, null, 2) : `${subcommand} complete.`);
          return;
        }

        case "variants": {
          const countValue = parseFlagValue(rest, "--count");
          const runArg = removeFlagValue(rest, "--count");
          const runDir = resolveRunDir(runArg, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const result = generateVariants(readRunState(runDir), countValue ? Number(countValue) : 3);
          sendStatus(pi, `Variants written.\n${[...result.files, result.comparisonPath].join("\n")}`);
          return;
        }

        case "choose-variant": {
          const parsed = parseOptionalRunDirAndRest(rest, ctx);
          if (!parsed.runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const { first } = consumeFirstArg(parsed.rest);
          const run = readRunState(parsed.runDir);
          const result = chooseVariant(run, Number(first));
          writeRunState(run);
          sendStatus(pi, `Selected variant ${first}.\n${result.selectedPath}`);
          return;
        }

        case "cover-check": {
          const parsedJson = parseJsonFlag(rest);
          const targetValue = parseFlagValue(parsedJson.rest, "--target");
          const withoutTarget = removeFlagValue(parsedJson.rest, "--target");
          const parsed = parseOptionalRunDirAndRest(withoutTarget, ctx);
          if (!parsed.runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const { first: coverPath } = consumeFirstArg(parsed.rest);
          if (!coverPath) {
            ctx.ui.notify("Usage: /book-genesis cover-check [run-dir] <cover-path> [--target ebook|paperback]", "error");
            return;
          }
          const result = writeCoverCheck(readRunState(parsed.runDir), coverPath, targetValue === "paperback" ? "paperback" : "ebook");
          sendStatus(pi, parsedJson.json ? JSON.stringify(result.report, null, 2) : `Cover check written.\n${result.mdPath}`);
          return;
        }

        case "revise-chapter": {
          const parsed = parseOptionalRunDirAndRest(rest, ctx);
          if (!parsed.runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const { first: chapter, rest: notes } = consumeFirstArg(parsed.rest);
          if (!chapter || !notes.trim()) {
            ctx.ui.notify("Usage: /book-genesis revise-chapter [run-dir] <chapter> <notes>", "error");
            return;
          }
          const run = readRunState(parsed.runDir);
          const feedbackPath = requestChapterRevision(run, chapter, notes);
          writeRunState(run);
          sendStatus(pi, `Chapter revision queued for ${chapter}.\nFeedback: ${feedbackPath}`);
          await launchPhaseSession(pi, ctx, run, `Targeted chapter revision requested for ${chapter}.`);
          return;
        }

        case "inspect-continuity": {
          const runDir = resolveRunDir(rest, ctx);
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(runDir);
          const outputPath = writeManuscriptIntelligenceReport(run);
          sendStatus(pi, `Manuscript intelligence report written to ${outputPath}.`);
          return;
        }

        case "checkpoint": {
          const checkpoint = parseSubcommand(rest);
          if (checkpoint.subcommand !== "write") {
            ctx.ui.notify("Usage: /book-genesis checkpoint write [run-dir] --sample <n>", "error");
            return;
          }
          const parsed = parseOptionalRunDirAndRest(checkpoint.rest.replace(/(?:^|\s)--sample\s+\d+(?=\s|$)/, " ").trim(), ctx);
          const runDir = parsed.runDir;
          if (!runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          let sample: number;
          try {
            sample = parseSampleCount(checkpoint.rest);
          } catch (error) {
            ctx.ui.notify((error as Error).message, "error");
            return;
          }
          const run = readRunState(runDir);
          requestWriteSampleCheckpoint(run, sample);
          writeRunState(run);
          sendStatus(pi, formatRunStatus(run));
          return;
        }

        case "compare-drafts": {
          const parsed = parseOptionalRunDirAndRest(rest, ctx);
          if (!parsed.runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const { first: left, rest: rightRest } = consumeFirstArg(parsed.rest);
          const { first: right } = consumeFirstArg(rightRest);
          if (!left || !right) {
            ctx.ui.notify("Usage: /book-genesis compare-drafts [run-dir] <left> <right>", "error");
            return;
          }
          const report = compareDrafts(readRunState(parsed.runDir), left, right);
          sendStatus(pi, `Draft comparison written to ${report.reportPath}.\nAdded lines: ${report.addedLines}\nRemoved lines: ${report.removedLines}`);
          return;
        }

        case "short-story": {
          const action = parseSubcommand(rest);
          if (action.subcommand !== "brainstorm" && action.subcommand !== "package") {
            ctx.ui.notify("Usage: /book-genesis short-story brainstorm [run-dir] [notes] OR /book-genesis short-story package [run-dir] <selected-concept>", "error");
            return;
          }
          const parsed = parseOptionalRunDirAndRest(action.rest, ctx);
          if (!parsed.runDir) {
            ctx.ui.notify("No run directory provided and no active run found.", "error");
            return;
          }
          const run = readRunState(parsed.runDir);
          if (action.subcommand === "brainstorm") {
            const brainstorm = buildShortStoryBrainstorm(run, parsed.rest);
            sendStatus(pi, brainstorm.markdown);
            return;
          }

          if (!parsed.rest.trim()) {
            ctx.ui.notify("Usage: /book-genesis short-story package [run-dir] <selected-concept>", "error");
            return;
          }
          const manifest = writeShortStoryPackage(run, parsed.rest);
          sendStatus(pi, `Short-story lead magnet package created for "${manifest.selectedConcept}".\n${manifest.files.join("\n")}`);
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
          ctx.ui.notify("Usage: /book-genesis run|resume|status|stop|approve|reject|feedback|list-runs|export|kdp|migrate|audit|doctor|stats|open ...", "info");
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
    name: "book_genesis_web_search",
    label: "Book Genesis Web Search",
    description: "Search the public internet for Book Genesis research-phase market, comp-title, audience, and source discovery.",
    promptSnippet: "Use this during the research phase whenever current market or source facts are needed.",
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      query: Type.String({ description: "Search query" }),
      max_results: Type.Optional(Type.Number({ description: "Maximum results, 1-10" })),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [{ type: "text", text: `Run is on phase ${run.currentPhase}, not ${params.phase}.` }],
        };
      }
      if (params.phase !== "research") {
        return {
          isError: true,
          content: [{ type: "text", text: "book_genesis_web_search is only available during the research phase." }],
        };
      }

      try {
        const results = await searchInternet(params.query, Number(params.max_results ?? 5));
        return { content: [{ type: "text", text: formatSearchResults(results) }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Internet search failed: ${(error as Error).message}` }],
        };
      }
    },
  });

  pi.registerTool({
    name: "book_genesis_fetch_url",
    label: "Book Genesis Fetch URL",
    description: "Fetch and simplify a public URL for Book Genesis research-phase source inspection.",
    promptSnippet: "Use this after book_genesis_web_search when a source needs more context than the snippet.",
    parameters: Type.Object({
      run_dir: Type.String({ description: "Absolute path to the Book Genesis run directory" }),
      phase: StringEnum(PHASE_ORDER),
      url: Type.String({ description: "HTTP or HTTPS URL to fetch" }),
      max_characters: Type.Optional(Type.Number({ description: "Maximum text characters to return" })),
    }),
    async execute(_toolCallId: string, params: any) {
      const run = readRunState(stripQuotes(params.run_dir));
      if (run.currentPhase !== params.phase) {
        return {
          isError: true,
          content: [{ type: "text", text: `Run is on phase ${run.currentPhase}, not ${params.phase}.` }],
        };
      }
      if (params.phase !== "research") {
        return {
          isError: true,
          content: [{ type: "text", text: "book_genesis_fetch_url is only available during the research phase." }],
        };
      }

      try {
        const text = await fetchResearchUrl(params.url, Number(params.max_characters ?? 6000));
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `URL fetch failed: ${(error as Error).message}` }],
        };
      }
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
        threshold: Type.Optional(Type.Number({ description: "Optional; defaults to the run's configured qualityThreshold." })),
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

      if (params.phase === "evaluate" && run.config.independentEvaluationPass) {
        try {
          const independent = readIndependentEvaluationScores(run);
          const primaryScores = (params.quality_gate?.scores ?? {}) as Record<string, number>;
          const disagreement = scoreDisagreement(primaryScores as any, independent.scores);

          if (Object.keys(independent.scores).length < 4) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Independent evaluation is enabled, but evaluations/independent-evaluation.md did not include enough numeric score lines (expected at least 4 like marketFit: 88).",
              }],
            };
          }

          if (disagreement.meanAbsDelta !== null && disagreement.meanAbsDelta > 18) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: `Independent evaluation scores disagree strongly with the quality gate scores (mean abs delta ${disagreement.meanAbsDelta.toFixed(1)} across ${disagreement.compared} keys). Reconcile the two evaluations before completing the phase.`,
              }],
            };
          }
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text", text: `Independent evaluation is enabled, but could not read/parse it: ${(error as Error).message}` }],
          };
        }
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
        qualityGate: params.quality_gate
          ? {
              ...params.quality_gate,
              // Always use the run-configured quality threshold.
              threshold: run.config.qualityThreshold,
            }
          : undefined,
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
      run_dir: Type.Optional(Type.String({ description: "Absolute path to the Book Genesis run directory" })),
      focus: Type.Optional(Type.String({ description: "What the compaction summary should emphasize" })),
    }),
    async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) {
      const focus = params.focus?.trim() || "Keep the active Book Genesis phase, artifacts, and next action.";
      const sessionKey = getSessionKey(ctx);
      const runDir = params.run_dir ? stripQuotes(params.run_dir) : sessionKey ? activeRunBySession.get(sessionKey) : null;
      ctx.compact({
        customInstructions: focus,
        onComplete: () => {
          if (!runDir) return;
          const run = readRunState(runDir);
          if (run.status === "running") {
            pi.sendUserMessage(buildAutoContinuePrompt(run, "tool-triggered context compaction completed"), { deliverAs: "followUp" });
          }
        },
      });

      return {
        content: [
          {
            type: "text",
            text: "Requested Book Genesis compaction. The active phase will auto-continue after compaction when the run is still active.",
          },
        ],
      };
    },
  });
}
