import { TextDecoder } from "node:util";
import {
  isAlias,
  isMap,
  isScalar,
  parseDocument,
  visit,
  type Node,
} from "yaml";
import { ValidationFailure, repositoryPath } from "./contracts.ts";

class StrictJsonParser {
  private index = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  parse(): unknown {
    const value = this.value();
    this.whitespace();
    if (this.index !== this.text.length) this.invalid();
    return value;
  }

  private whitespace(): void {
    while (
      this.index < this.text.length &&
      (this.text[this.index] === " " ||
        this.text[this.index] === "\t" ||
        this.text[this.index] === "\n" ||
        this.text[this.index] === "\r")
    ) {
      this.index += 1;
    }
  }

  private value(): unknown {
    this.whitespace();
    const token = this.text[this.index];
    if (token === "{") return this.object();
    if (token === "[") return this.array();
    if (token === '"') return this.string();
    if (this.text.startsWith("true", this.index)) {
      this.index += 4;
      return true;
    }
    if (this.text.startsWith("false", this.index)) {
      this.index += 5;
      return false;
    }
    if (this.text.startsWith("null", this.index)) {
      this.index += 4;
      return null;
    }
    return this.number();
  }

  private object(): Record<string, unknown> {
    this.index += 1;
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    this.whitespace();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (this.index < this.text.length) {
      this.whitespace();
      if (this.text[this.index] !== '"') this.invalid();
      const key = this.string();
      if (keys.has(key)) throw new Error("duplicate-json-member");
      keys.add(key);
      this.whitespace();
      if (this.text[this.index] !== ":") this.invalid();
      this.index += 1;
      result[key] = this.value();
      this.whitespace();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ",") this.invalid();
      this.index += 1;
    }
    return this.invalid();
  }

  private array(): unknown[] {
    this.index += 1;
    const result: unknown[] = [];
    this.whitespace();
    if (this.text[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (this.index < this.text.length) {
      result.push(this.value());
      this.whitespace();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ",") this.invalid();
      this.index += 1;
    }
    return this.invalid();
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.text.slice(start, this.index)) as string;
        } catch {
          return this.invalid();
        }
      }
      if (character === "\\") this.index += 1;
      this.index += 1;
    }
    return this.invalid();
  }

  private number(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.text.slice(this.index),
    );
    if (!match) return this.invalid();
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) return this.invalid();
    return value;
  }

  private invalid(): never {
    throw new Error("invalid-json");
  }
}

export function decodeCanonicalText(bytes: Buffer, path: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationFailure({
      code: "invalid-utf8",
      path: repositoryPath(path),
      message: "File is not valid UTF-8.",
    });
  }
  if (
    text.startsWith("\uFEFF") ||
    text.includes("\r") ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n")
  ) {
    throw new ValidationFailure({
      code: "non-canonical-newlines",
      path: repositoryPath(path),
      message: "Text must use LF and exactly one final newline.",
    });
  }
  return text;
}

export function parseStrictJson(text: string, path: string): unknown {
  try {
    const input = text.endsWith("\n") ? text.slice(0, -1) : text;
    return new StrictJsonParser(input).parse();
  } catch (error) {
    const code =
      error instanceof Error && error.message === "duplicate-json-member"
        ? "duplicate-json-member"
        : "invalid-json";
    throw new ValidationFailure({
      code,
      path: repositoryPath(path),
      message:
        code === "duplicate-json-member"
          ? "JSON object member names must be unique."
          : "File must use strict RFC 8259 JSON.",
    });
  }
}

function containsNonJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return false;
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNonJsonValue);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) => typeof key !== "string" || containsNonJsonValue(item),
    );
  }
  return true;
}

export function parseStrictYaml(text: string, path: string): unknown {
  const document = parseDocument(text, {
    merge: false,
    prettyErrors: false,
    uniqueKeys: true,
  });
  let forbidden: string | undefined;
  visit(document, (_key, unknownNode) => {
    const node = unknownNode as Node;
    if (forbidden) return visit.BREAK;
    if (isAlias(node)) {
      forbidden = "yaml-alias";
      return visit.BREAK;
    }
    if (isMap(node)) {
      for (const pair of node.items) {
        if (isScalar(pair.key) && pair.key.value === "<<") {
          forbidden = "yaml-merge-key";
          return visit.BREAK;
        }
      }
    }
    const allowedTags = new Set([
      "tag:yaml.org,2002:str",
      "tag:yaml.org,2002:seq",
      "tag:yaml.org,2002:map",
      "tag:yaml.org,2002:null",
      "tag:yaml.org,2002:bool",
      "tag:yaml.org,2002:int",
      "tag:yaml.org,2002:float",
    ]);
    if (
      "tag" in node &&
      typeof node.tag === "string" &&
      !allowedTags.has(node.tag)
    ) {
      forbidden = "yaml-custom-tag";
      return visit.BREAK;
    }
    return undefined;
  });

  if (!forbidden && document.errors.length > 0) {
    forbidden = document.errors.some((error) => /unique/i.test(error.message))
      ? "duplicate-yaml-key"
      : "invalid-yaml";
  }
  if (forbidden) {
    throw new ValidationFailure({
      code: forbidden,
      path: repositoryPath(path),
      message:
        "Authored YAML must use the strict JSON-compatible YAML 1.2 subset.",
    });
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch {
    throw new ValidationFailure({
      code: "invalid-yaml",
      path: repositoryPath(path),
      message: "Authored YAML could not be parsed safely.",
    });
  }
  if (containsNonJsonValue(value)) {
    throw new ValidationFailure({
      code: "yaml-non-json-value",
      path: repositoryPath(path),
      message: "Authored YAML values must be representable in JSON.",
    });
  }
  return value;
}

export function parseMarkdownDocument(
  text: string,
  path: string,
): { frontmatter: unknown; body: string } {
  if (!text.startsWith("---\n")) {
    throw new ValidationFailure({
      code: "invalid-note-frontmatter",
      path: repositoryPath(path),
      message: "Note must begin with YAML frontmatter.",
    });
  }
  const close = text.indexOf("\n---\n", 4);
  if (close < 0) {
    throw new ValidationFailure({
      code: "invalid-note-frontmatter",
      path: repositoryPath(path),
      message: "Note frontmatter closing delimiter is missing.",
    });
  }
  return {
    frontmatter: parseStrictYaml(text.slice(4, close), path),
    body: text.slice(close + 5),
  };
}
