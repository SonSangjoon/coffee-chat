import { cwd } from "node:process";
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
type Options = KnowledgeOptions | CandidateOptions | HookOptions;

function usageFailure(): UnableToComplete {
  return new UnableToComplete({
    code: "cli-usage",
    path: ".",
    message:
      "Usage: cc <validate|generate|check> [...], cc candidate prepare --request FILE --out DIR, cc candidate apply --dir DIR --approve DIGEST, or cc hooks inspect|install|uninstall [--format human|json].",
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
      const result = await prepareCandidate({
        root: cwd(),
        requestPath: options.request,
        out: options.out,
      });
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
      const receipt = await applyCandidate({
        root: cwd(),
        candidateDir: options.directory,
        approvedDigest: options.approve,
      });
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
