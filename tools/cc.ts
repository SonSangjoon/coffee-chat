import { cwd } from "node:process";
import { execFile } from "node:child_process";
import { applyCandidate, prepareCandidate } from "./candidate.ts";
import type { Diagnostic } from "./contracts.ts";
import {
  UnableToComplete,
  ValidationFailure,
  sortDiagnostics,
} from "./contracts.ts";
import { checkGeneratedIndex, writeGeneratedIndex } from "./generate.ts";
import { inspectHook, installHook, uninstallHook } from "./hooks.ts";
import { isInstanceGraph, validateKnowledge } from "./knowledge.ts";
import {
  checkGeneratedProjections,
  hasDeliveryProjectionInputs,
  writeGeneratedProjections,
} from "./projections.ts";
import { createSnapshot } from "./snapshot.ts";
import { observeTemplateFromGitHub } from "./template-adoption.ts";

type KnowledgeOptions = {
  kind: "knowledge";
  command: "validate" | "generate" | "check";
  snapshot: "worktree" | "staged";
  format: "human" | "json";
  baseRef?: string;
  generationCheck: boolean;
};
type CandidateOptions =
  | { kind: "candidate-prepare"; request: string; out: string }
  | { kind: "candidate-apply"; directory: string; approve: string };
type HookOptions = {
  kind: "hooks";
  command: "inspect" | "install" | "uninstall";
  format: "human" | "json";
};
type EngineUpdateOptions = {
  kind: "engine-update";
  action: "inspect" | "prepare" | "apply";
  args: string[];
};
type Options =
  | KnowledgeOptions
  | CandidateOptions
  | HookOptions
  | EngineUpdateOptions;

function usageFailure(): UnableToComplete {
  return new UnableToComplete({
    code: "cli-usage",
    path: ".",
    message:
      "Usage: cc <validate|generate|check> [...], cc candidate prepare --request FILE --out DIR, cc candidate apply --dir DIR --approve DIGEST, cc hooks inspect|install|uninstall [--format human|json], or cc engine update inspect --target PATH --source PATH --format human|json.",
  });
}

function parseArguments(args: string[]): Options {
  const command = args.shift();
  if (command === "candidate") {
    const action = args.shift();
    if (
      action === "prepare" &&
      args.length === 4 &&
      args[0] === "--request" &&
      args[2] === "--out" &&
      args[1] &&
      args[3]
    ) {
      return { kind: "candidate-prepare", request: args[1], out: args[3] };
    }
    if (
      action === "apply" &&
      args.length === 4 &&
      args[0] === "--dir" &&
      args[2] === "--approve" &&
      args[1] &&
      args[3] &&
      /^sha256:[a-f0-9]{64}$/.test(args[3])
    ) {
      return {
        kind: "candidate-apply",
        directory: args[1],
        approve: args[3],
      };
    }
    throw usageFailure();
  }
  if (command === "hooks") {
    const action = args.shift();
    if (action !== "inspect" && action !== "install" && action !== "uninstall")
      throw usageFailure();
    let format: "human" | "json" = "human";
    if (args.length > 0) {
      if (args.length !== 2 || args[0] !== "--format") throw usageFailure();
      if (args[1] !== "human" && args[1] !== "json") throw usageFailure();
      format = args[1];
    }
    return { kind: "hooks", command: action, format };
  }
  if (command === "engine") {
    if (
      args.length === 8 &&
      args[0] === "update" &&
      args[1] === "inspect" &&
      args[2] === "--target" &&
      args[3] &&
      args[4] === "--source" &&
      args[5] &&
      args[6] === "--format" &&
      (args[7] === "human" || args[7] === "json")
    )
      return {
        kind: "engine-update",
        action: "inspect",
        args: ["update", "inspect", ...args],
      };
    if (
      args.length === 12 &&
      args[0] === "update" &&
      args[1] === "prepare" &&
      args[2] === "--target" &&
      args[3] &&
      args[4] === "--source" &&
      args[5] &&
      args[6] === "--setup-receipt" &&
      args[7] &&
      args[8] === "--receipt" &&
      args[9] &&
      args[10] === "--out" &&
      args[11]
    )
      return {
        kind: "engine-update",
        action: "prepare",
        args: ["update", "prepare", ...args.slice(2)],
      };
    if (
      args.length === 10 &&
      args[0] === "update" &&
      args[1] === "apply" &&
      args[2] === "--target" &&
      args[3] &&
      args[4] === "--dir" &&
      args[5] &&
      args[6] === "--approve" &&
      args[7] &&
      /^sha256:[a-f0-9]{64}$/.test(args[7]) &&
      args[8] === "--receipt" &&
      args[9]
    )
      return {
        kind: "engine-update",
        action: "apply",
        args: ["update", "apply", ...args.slice(2)],
      };
    throw usageFailure();
  }
  if (command !== "validate" && command !== "generate" && command !== "check")
    throw usageFailure();
  const options: KnowledgeOptions = {
    kind: "knowledge",
    command,
    snapshot: "worktree",
    format: "human",
    generationCheck: false,
  };
  while (args.length > 0) {
    const option = args.shift();
    if (option === "--snapshot") {
      const value = args.shift();
      if (value !== "worktree" && value !== "staged") throw usageFailure();
      options.snapshot = value;
    } else if (option === "--format") {
      const value = args.shift();
      if (value !== "human" && value !== "json") throw usageFailure();
      options.format = value;
    } else if (option === "--base-ref") {
      const value = args.shift();
      if (!value) throw usageFailure();
      options.baseRef = value;
    } else if (option === "--check" && command === "generate") {
      options.generationCheck = true;
    } else throw usageFailure();
  }
  if (
    command === "generate" &&
    options.snapshot === "staged" &&
    !options.generationCheck
  ) {
    throw new UnableToComplete({
      code: "staged-generation-write-unsupported",
      path: "./knowledge/index.json",
      message:
        "Writing generated output from the staged virtual tree is not supported.",
    });
  }
  return options;
}

function render(diagnostics: Diagnostic[], format: "human" | "json"): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(sortDiagnostics(diagnostics))}\n`);
    return;
  }
  if (diagnostics.length === 0) {
    process.stdout.write("Coffee Chat validation passed.\n");
    return;
  }
  for (const diagnostic of sortDiagnostics(diagnostics)) {
    process.stdout.write(
      `${diagnostic.path}${diagnostic.pointer ?? ""}: [${diagnostic.code}] ${diagnostic.message}\n`,
    );
  }
}

function runEngineDelivery(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--experimental-strip-types", "tools/engine-cli.ts", ...args],
      { cwd: cwd(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) =>
        resolve({
          code:
            error && typeof error.code === "number"
              ? error.code
              : error
                ? 2
                : 0,
          stdout: String(stdout),
          stderr: String(stderr),
        }),
    );
  });
}

async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    const failure = error instanceof UnableToComplete ? error : usageFailure();
    const format =
      process.argv.includes("--format") &&
      process.argv[process.argv.indexOf("--format") + 1] === "json"
        ? "json"
        : "human";
    render([failure.diagnostic], format);
    process.exitCode = 2;
    return;
  }

  if (options.kind === "candidate-prepare") {
    try {
      const result = await prepareCandidate(
        {
          root: cwd(),
          requestPath: options.request,
          out: options.out,
        },
        {
          observeTemplate: (expected) =>
            observeTemplateFromGitHub(cwd(), expected),
        },
      );
      process.stdout.write(
        `${JSON.stringify({
          candidate_digest: result.candidateDigest,
          preview_json: result.previewJson,
          preview_md: result.previewMarkdown,
        })}\n`,
      );
      process.exitCode = 0;
    } catch (error) {
      const failure =
        error instanceof UnableToComplete || error instanceof ValidationFailure
          ? error
          : new UnableToComplete({
              code: "candidate-internal-error",
              path: ".",
              message:
                "Candidate preparation could not complete; details are redacted.",
            });
      render([failure.diagnostic], "human");
      process.exitCode = failure instanceof ValidationFailure ? 1 : 2;
      return;
    }
    return;
  }
  if (options.kind === "candidate-apply") {
    try {
      const receipt = await applyCandidate(
        {
          root: cwd(),
          candidateDir: options.directory,
          approvedDigest: options.approve,
        },
        {
          observeTemplate: (expected) =>
            observeTemplateFromGitHub(cwd(), expected),
        },
      );
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      process.exitCode = receipt.status === "applied" ? 0 : 1;
    } catch (error) {
      const failure =
        error instanceof UnableToComplete || error instanceof ValidationFailure
          ? error
          : new UnableToComplete({
              code: "candidate-internal-error",
              path: ".",
              message:
                "Candidate apply could not complete; details are redacted.",
            });
      render([failure.diagnostic], "human");
      process.exitCode = failure instanceof ValidationFailure ? 1 : 2;
      return;
    }
    return;
  }
  if (options.kind === "hooks") {
    try {
      const result =
        options.command === "inspect"
          ? await inspectHook(cwd())
          : options.command === "install"
            ? await installHook(cwd())
            : await uninstallHook(cwd());
      if (options.format === "json")
        process.stdout.write(`${JSON.stringify(result)}\n`);
      else
        process.stdout.write(
          `Coffee Chat hook ${options.command}: ${"classification" in result ? result.classification : result.status}.\n`,
        );
      process.exitCode = 0;
    } catch (error) {
      const failure =
        error instanceof UnableToComplete || error instanceof ValidationFailure
          ? error
          : new UnableToComplete({
              code: "hook-lifecycle-internal-error",
              path: ".",
              message:
                "Hook lifecycle could not complete; details are redacted.",
            });
      render([failure.diagnostic], options.format);
      process.exitCode = failure instanceof ValidationFailure ? 1 : 2;
    }
    return;
  }

  if (options.kind === "engine-update") {
    const updateFormat: "human" | "json" =
      options.args.includes("--format") &&
      options.args[options.args.indexOf("--format") + 1] === "human"
        ? "human"
        : "json";
    try {
      const snapshot = await createSnapshot(cwd(), "worktree");
      const validation = await validateKnowledge(snapshot, {
        validateIndex: false,
      });
      if (!validation.graph || validation.diagnostics.length > 0) {
        render(validation.diagnostics, updateFormat);
        process.exitCode = 1;
        return;
      }
      if (validation.graph.manifest.repository_role !== "engine") {
        render(
          [
            {
              code: "engine-update-engine-role-required",
              path: "./coffee-chat.json",
              message:
                "Engine update inspection is available only from an engine checkout.",
            },
          ],
          updateFormat,
        );
        process.exitCode = 1;
        return;
      }
      const result = await runEngineDelivery(options.args);
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exitCode = result.code;
    } catch {
      render(
        [
          {
            code: "engine-update-unavailable",
            path: ".",
            message: "Engine update inspection could not be started.",
          },
        ],
        updateFormat,
      );
      process.exitCode = 2;
    }
    return;
  }

  try {
    const snapshot = await createSnapshot(cwd(), options.snapshot);
    const validation = await validateKnowledge(snapshot, {
      ...(options.baseRef ? { baseRef: options.baseRef } : {}),
      validateIndex: options.command !== "generate" || options.generationCheck,
    });
    if (!validation.graph || validation.diagnostics.length > 0) {
      render(validation.diagnostics, options.format);
      process.exitCode = 1;
      return;
    }

    if (
      validation.graph.manifest.repository_role === "engine" &&
      (options.command === "generate" || options.command === "check") &&
      (await snapshot.exists("tools/engine-cli.ts"))
    ) {
      const deliveryArgs: string[] = [options.command];
      if (options.generationCheck) deliveryArgs.push("--check");
      deliveryArgs.push(
        "--snapshot",
        options.snapshot,
        "--format",
        options.format,
      );
      const result = await runEngineDelivery(deliveryArgs);
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exitCode = result.code;
      return;
    }

    const hasDelivery = await hasDeliveryProjectionInputs(snapshot);
    let diagnostics: Diagnostic[] = [];
    if (options.command === "check" || options.generationCheck) {
      diagnostics = [
        ...(isInstanceGraph(validation.graph)
          ? await checkGeneratedIndex(snapshot, validation.graph)
          : []),
        ...(hasDelivery
          ? await checkGeneratedProjections(snapshot, validation.graph)
          : []),
      ];
    } else if (options.command === "generate") {
      if (isInstanceGraph(validation.graph))
        await writeGeneratedIndex(cwd(), validation.graph);
      if (hasDelivery)
        await writeGeneratedProjections(cwd(), snapshot, validation.graph);
    }
    render(diagnostics, options.format);
    process.exitCode = diagnostics.length > 0 ? 1 : 0;
  } catch (error) {
    if (
      error instanceof UnableToComplete ||
      error instanceof ValidationFailure
    ) {
      render([error.diagnostic], options.format);
      process.exitCode = error instanceof UnableToComplete ? 2 : 1;
      return;
    }
    render(
      [
        {
          code: "validator-internal-error",
          path: ".",
          message:
            "Validator could not complete; internal details are redacted.",
        },
      ],
      options.format,
    );
    process.exitCode = 2;
  }
}

await main();
