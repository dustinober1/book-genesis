import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { loadRunConfig } from "./config.js";
import { findLatestRunDir, readRunState } from "./state.js";
import type { DoctorReport, HealthCheckResult } from "./types.js";
import { writeStarterConfig } from "./config-init.js";

interface DoctorOptions {
  workspaceRoot: string;
  packageRoot: string;
  extensionsRoot?: string;
  includeSiblingExtensions?: boolean;
  fix?: boolean;
  mode?: "fiction" | "memoir" | "prescriptive-nonfiction" | "narrative-nonfiction" | "childrens";
}

function result(
  ok: boolean,
  severity: HealthCheckResult["severity"],
  code: string,
  message: string,
  remedy?: string,
): HealthCheckResult {
  return { ok, severity, code, message, remedy };
}

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function dependencyNames(packageJson: Record<string, unknown>) {
  const sections = ["dependencies", "devDependencies", "peerDependencies"] as const;
  const names = new Set<string>();
  for (const section of sections) {
    const value = packageJson[section];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    for (const name of Object.keys(value)) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function checkPackage(packageRoot: string) {
  const packagePath = path.join(packageRoot, "package.json");
  if (!existsSync(packagePath)) {
    return [result(false, "error", "package_missing", `No package.json found at ${packagePath}.`, "Run doctor from the Book Genesis package root.")];
  }

  const packageJson = readJson(packagePath);
  const checks = [
    result(true, "info", "package_found", `Found package ${String(packageJson.name ?? "unknown")} at ${packagePath}.`),
  ];

  for (const name of dependencyNames(packageJson)) {
    const depPath = path.join(packageRoot, "node_modules", name);
    if (!existsSync(depPath)) {
      checks.push(result(false, "error", "dependency_missing", `Dependency ${name} is not installed.`, "Run npm install in the package directory."));
    }
  }

  return checks;
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  return result(
    major >= 20,
    major >= 20 ? "info" : "error",
    major >= 20 ? "node_version_ok" : "node_version_unsupported",
    `Node.js version is ${process.versions.node}.`,
    major >= 20 ? undefined : "Use Node.js 20 or newer.",
  );
}

function checkWorkspaceWritable(workspaceRoot: string) {
  try {
    accessSync(workspaceRoot, constants.R_OK | constants.W_OK);
    return result(true, "info", "workspace_writable", `Workspace is readable and writable: ${workspaceRoot}.`);
  } catch {
    return result(false, "error", "workspace_not_writable", `Workspace is not writable: ${workspaceRoot}.`, "Fix directory permissions before running Book Genesis.");
  }
}

function checkConfig(workspaceRoot: string) {
  try {
    loadRunConfig(workspaceRoot);
    return result(true, "info", "config_valid", "Book Genesis config is valid.");
  } catch (error) {
    return result(false, "error", "config_invalid", `Book Genesis config is invalid: ${(error as Error).message}`, "Fix book-genesis.config.json.");
  }
}

function checkLatestRun(workspaceRoot: string) {
  const latest = findLatestRunDir(workspaceRoot);
  if (!latest) {
    return result(true, "info", "latest_run_absent", "No existing Book Genesis runs found.");
  }

  try {
    const run = readRunState(latest);
    return result(true, "info", "latest_run_readable", `Latest run is readable: ${run.id}.`);
  } catch (error) {
    return result(false, "error", "latest_run_broken", `Latest run could not be read: ${(error as Error).message}`, "Inspect the run.json file or run /book-genesis migrate.");
  }
}

function checkSiblingExtensions(packageRoot: string, extensionsRoot?: string) {
  const root = extensionsRoot ?? path.dirname(packageRoot);
  if (!existsSync(root)) {
    return [];
  }

  const checks: HealthCheckResult[] = [];
  for (const entry of readdirSync(root)) {
    const sibling = path.join(root, entry);
    let isDirectory = false;
    try {
      isDirectory = statSync(sibling).isDirectory();
    } catch {
      continue;
    }

    if (sibling === packageRoot || !isDirectory) {
      continue;
    }

    const packagePath = path.join(sibling, "package.json");
    if (!existsSync(packagePath)) {
      continue;
    }

    const packageJson = readJson(packagePath);
    for (const name of dependencyNames(packageJson)) {
      if (!existsSync(path.join(sibling, "node_modules", name))) {
        checks.push(result(
          false,
          "warning",
          "sibling_dependency_missing",
          `Sibling extension ${entry} is missing dependency ${name}.`,
          `Run npm install in ${sibling} if Pi startup fails before Book Genesis loads.`,
        ));
      }
    }
  }

  if (checks.length === 0) {
    checks.push(result(true, "info", "sibling_extensions_ok", "No sibling extension dependency gaps found."));
  }

  return checks;
}

export function buildDoctorReport(options: DoctorOptions): DoctorReport {
  const fixResults: HealthCheckResult[] = [];
  if (options.fix) {
    for (const dir of ["book-projects", "prompts", "extensions"]) {
      mkdirSync(path.join(options.workspaceRoot, dir), { recursive: true });
    }
    fixResults.push(result(true, "info", "workspace_dirs_ready", "Expected workspace directories exist."));
    const configPath = path.join(options.workspaceRoot, "book-genesis.config.json");
    if (!existsSync(configPath) && options.mode) {
      writeStarterConfig(options.workspaceRoot, options.mode, false);
      fixResults.push(result(true, "info", "starter_config_created", `Created starter config for ${options.mode}.`));
    } else if (!existsSync(configPath)) {
      fixResults.push(result(true, "info", "starter_config_skipped", "No config exists; pass a mode to doctor --fix to create one."));
    }
  }

  const results: HealthCheckResult[] = [
    ...fixResults,
    checkNodeVersion(),
    checkWorkspaceWritable(options.workspaceRoot),
    checkConfig(options.workspaceRoot),
    checkLatestRun(options.workspaceRoot),
    ...checkPackage(options.packageRoot),
  ];

  if (options.includeSiblingExtensions !== false) {
    results.push(...checkSiblingExtensions(options.packageRoot, options.extensionsRoot));
  }

  return {
    ok: results.every((item) => item.severity !== "error"),
    generatedAt: new Date().toISOString(),
    workspaceRoot: options.workspaceRoot,
    packageRoot: options.packageRoot,
    results,
  };
}

export function formatDoctorReport(report: DoctorReport) {
  const lines = [
    "Book Genesis doctor",
    "",
    `- Workspace: ${report.workspaceRoot}`,
    `- Package: ${report.packageRoot}`,
    `- Status: ${report.ok ? "OK" : "NEEDS ATTENTION"}`,
    "",
  ];

  for (const item of report.results) {
    lines.push(`- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`);
    if (item.remedy) {
      lines.push(`  Remedy: ${item.remedy}`);
    }
  }

  return lines.join("\n");
}
