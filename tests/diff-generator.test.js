import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/process.js", () => ({
  runCommand: vi.fn()
}));

const { runCommand } = await import("../src/utils/process.js");
const { generateDiff, getUntrackedFiles } = await import("../src/review/diff-generator.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateDiff", () => {
  it("builds diff against base ref including uncommitted workspace changes", async () => {
    runCommand.mockResolvedValue({ exitCode: 0, stdout: "diff --git ...", stderr: "" });

    await generateDiff({ baseRef: "abc123" });

    expect(runCommand).toHaveBeenCalledWith("git", ["diff", "abc123"]);
  });
});

describe("getUntrackedFiles", () => {
  it("returns list of untracked files excluding gitignored", async () => {
    runCommand.mockResolvedValue({
      exitCode: 0,
      stdout: "src/guards/policy-resolver.js\ntests/guards/policy-resolver.test.js\n",
      stderr: ""
    });

    const files = await getUntrackedFiles();

    expect(runCommand).toHaveBeenCalledWith("git", ["ls-files", "--others", "--exclude-standard"]);
    expect(files).toEqual([
      "src/guards/policy-resolver.js",
      "tests/guards/policy-resolver.test.js"
    ]);
  });

  it("returns empty array when no untracked files", async () => {
    runCommand.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const files = await getUntrackedFiles();

    expect(files).toEqual([]);
  });

  it("returns empty array when command fails", async () => {
    runCommand.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "error" });

    const files = await getUntrackedFiles();

    expect(files).toEqual([]);
  });
});
