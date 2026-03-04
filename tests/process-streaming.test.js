import { describe, expect, it, vi } from "vitest";
import { runCommand } from "../src/utils/process.js";

describe("runCommand onOutput streaming", () => {
  it("calls onOutput for each line of stdout", async () => {
    const lines = [];
    const onOutput = ({ stream, line }) => lines.push({ stream, line });

    const result = await runCommand("echo", ["-e", "line1\nline2\nline3"], { onOutput });

    expect(result.exitCode).toBe(0);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const stdoutLines = lines.filter((l) => l.stream === "stdout");
    expect(stdoutLines.length).toBeGreaterThanOrEqual(1);
    expect(stdoutLines.some((l) => l.line.includes("line1"))).toBe(true);
  });

  it("calls onOutput for stderr", async () => {
    const lines = [];
    const onOutput = ({ stream, line }) => lines.push({ stream, line });

    const result = await runCommand("bash", ["-c", "echo err_msg >&2"], { onOutput });

    const stderrLines = lines.filter((l) => l.stream === "stderr");
    expect(stderrLines.some((l) => l.line.includes("err_msg"))).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("works without onOutput (backward compatible)", async () => {
    const result = await runCommand("echo", ["hello"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("still returns full stdout even with onOutput", async () => {
    const lines = [];
    const result = await runCommand("echo", ["full_output"], {
      onOutput: ({ stream, line }) => lines.push({ stream, line })
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("full_output");
  });

  it("filters out empty lines from onOutput", async () => {
    const lines = [];
    const result = await runCommand("echo", ["-e", "a\n\nb"], {
      onOutput: ({ stream, line }) => lines.push({ stream, line })
    });

    expect(result.exitCode).toBe(0);
    const stdoutLines = lines.filter((l) => l.stream === "stdout");
    for (const l of stdoutLines) {
      expect(l.line).not.toBe("");
    }
  });

  it("kills command when silence timeout is exceeded", async () => {
    const result = await runCommand("bash", ["-c", "sleep 1; echo late"], {
      silenceTimeoutMs: 50
    });

    expect(result.exitCode).toBe(143);
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toContain("without output");
  });

  it("streams carriage-return output as line events", async () => {
    const lines = [];
    const result = await runCommand("bash", ["-c", "printf 'step1\\rstep2\\rstep3\\n'"], {
      onOutput: ({ stream, line }) => lines.push({ stream, line })
    });

    expect(result.exitCode).toBe(0);
    const stdoutLines = lines.filter((l) => l.stream === "stdout").map((l) => l.line);
    expect(stdoutLines.some((l) => l.includes("step1"))).toBe(true);
    expect(stdoutLines.some((l) => l.includes("step2"))).toBe(true);
    expect(stdoutLines.some((l) => l.includes("step3"))).toBe(true);
  });

  it("flushes partial output when no newline arrives", async () => {
    const lines = [];
    const result = await runCommand("bash", ["-c", "printf 'partial'; sleep 0.2; printf ' done\\n'"], {
      onOutput: ({ stream, line }) => lines.push({ stream, line }),
      partialOutputFlushMs: 50
    });

    expect(result.exitCode).toBe(0);
    const stdoutLines = lines.filter((l) => l.stream === "stdout").map((l) => l.line);
    expect(stdoutLines.some((l) => l.includes("partial"))).toBe(true);
    expect(result.stdout).toContain("partial done");
  });
});
