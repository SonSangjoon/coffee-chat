import { createHash, randomUUID } from "node:crypto";

export type OperationName =
  | "init"
  | "harvest"
  | "sync"
  | "coffee-pairing"
  | "update";

export type OperationPreviewStatus = "pending_approval";

export type OperationPreview = {
  schema_version: "1.0.0";
  preview_id: string;
  operation: OperationName;
  status: OperationPreviewStatus;
  created_at: string;
  expires_at: string;
  actor: {
    engine_version: string;
    session_id: string;
  };
  sources: Array<{
    kind: string;
    identity: string;
    locator: string;
    digest: string;
  }>;
  targets: Array<{
    kind: string;
    identity: string;
    locator: string;
    repository_role?: string;
  }>;
  scope: {
    read_set: string[];
    write_set: string[];
    protected_set: string[];
  };
  changes: Array<{
    path_or_field: string;
    action: "create" | "update" | "delete";
    before_digest: string | null;
    after_digest: string | null;
    summary: string;
  }>;
  content: {
    operation_specific_summary: string;
    provenance: string[];
    risks: string[];
  };
  revalidation: {
    fingerprint: string;
    required_observations: string[];
  };
  approval: {
    required: true;
    fingerprint: string;
    status: "pending";
  };
  fingerprint: string;
};

export type OperationReceipt = {
  schema_version: "1.0.0";
  receipt_id: string;
  preview_id: string;
  operation: OperationName;
  status: "applied" | "partial_failure";
  fingerprint: string;
  changed_paths: string[];
  protected_paths: string[];
  verified: boolean;
};

export class OperationFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OperationFailure";
    this.code = code;
  }
}

export function sha256(bytes: Buffer | string): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function fingerprint(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function createOperationPreview(input: {
  operation: OperationName;
  actor?: Partial<OperationPreview["actor"]>;
  sources: OperationPreview["sources"];
  targets: OperationPreview["targets"];
  scope: OperationPreview["scope"];
  changes: OperationPreview["changes"];
  content: OperationPreview["content"];
  required_observations: string[];
  state_fingerprint: string;
  now?: Date;
}): OperationPreview {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const previewId = "preview-" + randomUUID();
  return {
    schema_version: "1.0.0",
    preview_id: previewId,
    operation: input.operation,
    status: "pending_approval",
    created_at: createdAt,
    expires_at: expiresAt,
    actor: {
      engine_version: input.actor?.engine_version ?? "unknown",
      session_id: input.actor?.session_id ?? previewId,
    },
    sources: input.sources,
    targets: input.targets,
    scope: input.scope,
    changes: input.changes,
    content: input.content,
    revalidation: {
      fingerprint: input.state_fingerprint,
      required_observations: input.required_observations,
    },
    approval: {
      required: true,
      fingerprint: input.state_fingerprint,
      status: "pending",
    },
    fingerprint: input.state_fingerprint,
  };
}

export function assertPreviewApproval(
  preview: OperationPreview,
  operation: OperationName,
  approvedFingerprint: string,
): void {
  if (preview.operation !== operation)
    throw new OperationFailure(
      operation + "-approval-mismatch",
      "The approval belongs to a different Coffee operation.",
    );
  if (
    preview.status !== "pending_approval" ||
    preview.approval.status !== "pending"
  )
    throw new OperationFailure(
      operation + "-approval-invalid",
      "The Operation Preview is no longer pending approval.",
    );
  if (preview.fingerprint !== approvedFingerprint)
    throw new OperationFailure(
      operation + "-approval-mismatch",
      "The approval fingerprint does not match the Operation Preview.",
    );
  if (new Date(preview.expires_at).getTime() <= Date.now())
    throw new OperationFailure(
      operation + "-preview-expired",
      "The Operation Preview has expired and must be prepared again.",
    );
}

export function assertFreshPreview(
  operation: string,
  expected: string,
  actual: string,
): void {
  if (expected !== actual)
    throw new OperationFailure(
      operation + "-stale-preview",
      "The target changed after the Operation Preview and requires a new review.",
    );
}

export function operationReceipt(input: {
  preview: OperationPreview;
  status: OperationReceipt["status"];
  changed_paths: string[];
  protected_paths: string[];
  verified: boolean;
}): OperationReceipt {
  return {
    schema_version: "1.0.0",
    receipt_id: "receipt-" + randomUUID(),
    preview_id: input.preview.preview_id,
    operation: input.preview.operation,
    status: input.status,
    fingerprint: input.preview.fingerprint,
    changed_paths: [...input.changed_paths].sort(),
    protected_paths: [...input.protected_paths].sort(),
    verified: input.verified,
  };
}
