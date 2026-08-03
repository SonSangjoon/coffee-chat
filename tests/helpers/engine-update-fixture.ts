import { createHash } from "node:crypto";

/** Deterministic identities used by update tests without any network fixture. */
export function syntheticReleaseIdentity(version: "1.1.0" | "1.1.1") {
  return {
    repository: "https://github.com/example/coffee-chat",
    version,
    release_digest:
      `sha256:${createHash("sha256").update(`release:${version}`).digest("hex")}` as const,
  };
}
