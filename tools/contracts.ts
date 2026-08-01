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
  for (const original of diagnostics) {
    const diagnostic: Diagnostic = {
      code: original.code,
      path: redactSensitiveText(original.path),
      ...(original.pointer
        ? { pointer: redactSensitiveText(original.pointer) }
        : {}),
      message: redactSensitiveText(original.message),
    };
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

export function containsUnpairedUnicodeSurrogate(value: unknown): boolean {
  if (typeof value === "string") return stringHasUnpairedSurrogate(value);
  if (Array.isArray(value)) return value.some(containsUnpairedUnicodeSurrogate);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) =>
        stringHasUnpairedSurrogate(key) ||
        containsUnpairedUnicodeSurrogate(item),
    );
  }
  return false;
}

function stringHasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "<redacted>")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "<redacted>")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "<redacted>")
    .replace(/:\/\/[^/@\s]+@/g, "://<redacted>@")
    .replace(
      /((?:api[_-]?key|access[_-]?token|token|secret|signature|sig|key)=)[^&/\s]+/gi,
      "$1<redacted>",
    );
}
