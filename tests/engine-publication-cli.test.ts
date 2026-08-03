import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

describe("engine publication CLI grammar", () => {
  it("rejects publication commands without the external paths and digest", async () => {
    await expect(
      run(
        process.execPath,
        [
          "--experimental-strip-types",
          "tools/engine-cli.ts",
          "update",
          "publish",
          "apply",
        ],
        { cwd: root },
      ),
    ).rejects.toMatchObject({ code: 2 });
  });

  it("does not expose a merge action", async () => {
    await expect(
      run(
        process.execPath,
        [
          "--experimental-strip-types",
          "tools/engine-cli.ts",
          "update",
          "publish",
          "merge",
        ],
        { cwd: root },
      ),
    ).rejects.toMatchObject({ code: 2 });
  });
});
