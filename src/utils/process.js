import { execa } from "execa";

export async function runCommand(command, args = [], options = {}) {
  const { timeout, onOutput, ...rest } = options;
  const subprocess = execa(command, args, {
    reject: false,
    ...rest
  });

  let stdoutAccum = "";
  let stderrAccum = "";

  if (subprocess.stdout) {
    subprocess.stdout.on("data", (chunk) => {
      stdoutAccum += chunk.toString();
    });
  }
  if (subprocess.stderr) {
    subprocess.stderr.on("data", (chunk) => {
      stderrAccum += chunk.toString();
    });
  }

  if (onOutput) {
    const handler = (stream) => {
      let partial = "";
      return (chunk) => {
        partial += chunk.toString();
        const lines = partial.split("\n");
        partial = lines.pop();
        for (const line of lines) {
          if (line) onOutput({ stream, line });
        }
      };
    };
    if (subprocess.stdout) subprocess.stdout.on("data", handler("stdout"));
    if (subprocess.stderr) subprocess.stderr.on("data", handler("stderr"));
  }

  try {
    if (!timeout) {
      const result = await subprocess;
      return enrichResult(result, stdoutAccum, stderrAccum);
    }

    let timer = null;
    const timeoutResult = new Promise((resolve) => {
      timer = setTimeout(() => {
        try {
          subprocess.kill("SIGKILL", { forceKillAfterDelay: 1000 });
        } catch {
          // no-op
        }
        resolve({
          exitCode: 143,
          stdout: stdoutAccum,
          stderr: `Command timed out after ${timeout}ms`,
          timedOut: true,
          signal: "SIGKILL"
        });
      }, timeout);
    });

    const result = await Promise.race([subprocess, timeoutResult]);
    if (timer) clearTimeout(timer);
    return enrichResult(result, stdoutAccum, stderrAccum);
  } catch (error) {
    const details = [
      error?.shortMessage,
      error?.originalMessage,
      error?.stderr,
      error?.stdout,
      error?.message
    ]
      .filter(Boolean)
      .join("\n");

    return {
      exitCode: 1,
      stdout: error?.stdout || stdoutAccum,
      stderr: details || String(error),
      signal: error?.signal || null
    };
  }
}

function enrichResult(result, stdoutAccum, stderrAccum) {
  if (result.timedOut) return result;

  const killed = result.killed || !!result.signal;
  const signal = result.signal || null;

  if (killed && !result.stderr) {
    return {
      ...result,
      stdout: result.stdout || stdoutAccum,
      stderr: signal
        ? `Process killed by signal ${signal}`
        : "Process was killed externally",
      signal
    };
  }

  return result;
}
