import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostExecutableAvailable } from "./helpers/isolated-host-config.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("isolated host executable discovery", () => {
  it("classifies only an absent executable as unavailable", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-host-probe-"));
    temporaryRoots.push(root);
    const broken = resolve(root, "present-but-broken");
    await writeFile(broken, "#!/bin/sh\nexit 9\n");
    await chmod(broken, 0o700);

    expect(hostExecutableAvailable(resolve(root, "absent"))).toBe(false);
    expect(hostExecutableAvailable(broken)).toBe(true);
  });
});
