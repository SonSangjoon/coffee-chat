import type {
  EngineManifest,
  InstanceManifest,
  Manifest,
} from "./knowledge.ts";

export type RepositorySnapshotEntry = {
  path: string;
  mode: "100644" | "100755" | "120000";
};

export type RepositoryProjection = {
  outputs: Array<{
    path: string;
    bytes: Buffer;
    mode: "100644" | "100755";
  }>;
  deletions: string[];
};

export type EngineReleaseConfig = {
  schema_version: "1.0.0";
  version: string;
  source_ref: `refs/tags/v${string}`;
  target_manifest_schema_version: string;
};

export type EngineFile = {
  path: `./${string}`;
  digest: `sha256:${string}`;
  mode: "100644" | "100755";
};

export type EngineManagedFile = EngineFile & { class: "engine-source" };
export type EngineDeliveryFile = EngineFile & { class: "engine-delivery" };

export type EngineReleaseManifest = {
  schema_version: "1.0.0";
  repository: string;
  version: string;
  source_ref: `refs/tags/v${string}`;
  target_manifest_schema_version: string;
  migration_registry: {
    path: "./engine/migrations/registry.json";
    digest: `sha256:${string}`;
  };
  managed_files: EngineManagedFile[];
  delivery_files: EngineDeliveryFile[];
  release_digest: `sha256:${string}`;
};

export type TemplateDisposition =
  | "adopt-engine-source"
  | "replace-instance-authored"
  | "replace-instance-generated"
  | "remove-engine-only";

export type ArtifactContext =
  | "engine-repository"
  | "template-copy"
  | "instance-repository";

export type ArtifactAudience = "instance" | "engine-only" | "local";
export type ArtifactOwnership = "source" | "generated" | "authored";

export type EngineArtifactPolicy = {
  path: string;
  states: Partial<
    Record<
      ArtifactContext,
      { audience: ArtifactAudience; ownership: ArtifactOwnership }
    >
  >;
  template_disposition: TemplateDisposition;
  release_class: "managed" | "delivery" | "excluded";
};

export type TemplateSurfaceFile = {
  path: `./${string}`;
  mode: "100644" | "100755";
  engine_audience: "instance" | "engine-only";
  engine_ownership: "source" | "generated" | "authored";
  disposition: TemplateDisposition;
  binding:
    | { kind: "content"; digest: `sha256:${string}` }
    | { kind: "surface-self-copy" };
};

export type EngineTemplateSurfaceManifest = {
  schema_version: "1.0.0";
  repository: string;
  release: Pick<
    EngineReleaseManifest,
    "version" | "source_ref" | "release_digest"
  >;
  files: TemplateSurfaceFile[];
  surface_digest: `sha256:${string}`;
};

export type ManifestForRole = EngineManifest | InstanceManifest;

export function isEngineManifestShape(
  value: ManifestForRole,
): value is EngineManifest {
  return value.repository_role === "engine";
}
