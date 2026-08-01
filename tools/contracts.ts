export type Diagnostic = {
  code: string;
  path: string;
  pointer?: string;
  message: string;
};

export class ValidationFailure extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

export class UnableToComplete extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

export function repositoryPath(path: string): string {
  return path.startsWith("./") ? path : `./${path}`;
}

export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.path}\u0000${diagnostic.pointer ?? ""}\u0000${diagnostic.code}`;
    if (!unique.has(key)) unique.set(key, diagnostic);
  }
  return [...unique.values()].sort((left, right) =>
    [left.path, left.pointer ?? "", left.code]
      .join("\u0000")
      .localeCompare(
        [right.path, right.pointer ?? "", right.code].join("\u0000"),
        "en",
      ),
  );
}
