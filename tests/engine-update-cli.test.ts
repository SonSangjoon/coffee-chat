import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

describe("engine update inspection CLI", () => {
  it("rejects malformed engine update grammar before dispatch", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        ["--experimental-strip-types", "tools/cc.ts", "engine", "update"],
        { cwd: root },
      ),
    ).rejects.toMatchObject({ code: 2 });
  });
});
