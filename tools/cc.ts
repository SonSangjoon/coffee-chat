import { cwd } from "node:process";
import type { Diagnostic } from "./contracts.ts";
import {
  UnableToComplete,
  ValidationFailure,
  sortDiagnostics,
} from "./contracts.ts";
import { checkGeneratedIndex, writeGeneratedIndex } from "./generate.ts";
import { validateKnowledge } from "./knowledge.ts";
import { createSnapshot } from "./snapshot.ts";

type Command = "validate" | "generate" | "check";
type Options = {
  command: Command;
  snapshot: "worktree" | "staged";
  format: "human" | "json";
  baseRef?: string;
  generationCheck: boolean;
};

function usageFailure(): UnableToComplete {
  return new UnableToComplete({
    code: "cli-usage",
    path: ".",
    message:
      "Usage: cc <validate|generate|check> [--snapshot worktree|staged] [--format human|json] [--base-ref REV] [--check].",
  });
}

function parseArguments(args: string[]): Options {
  const command = args.shift();
  if (command !== "validate" && command !== "generate" && command !== "check")
    throw usageFailure();
  const options: Options = {
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

    let diagnostics: Diagnostic[] = [];
    if (options.command === "check" || options.generationCheck) {
      diagnostics = await checkGeneratedIndex(snapshot, validation.graph);
    } else if (options.command === "generate") {
      await writeGeneratedIndex(cwd(), validation.graph);
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
