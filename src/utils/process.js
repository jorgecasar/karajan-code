import { execa } from "execa";

export async function runCommand(command, args = [], options = {}) {
  const { timeout, onOutput, silenceTimeoutMs, partialOutputFlushMs, ...rest } = options;
  const subprocess = execa(command, args, {
    reject: false,
    ...rest
  });

  let stdoutAccum = "";
  let stderrAccum = "";
  let outputSilenceTimer = null;
  let silenceTimedOut = false;

  function clearSilenceTimer() {
    if (outputSilenceTimer) {
      clearTimeout(outputSilenceTimer);
      outputSilenceTimer = null;
    }
  }

  function armSilenceTimer() {
    const ms = Number(silenceTimeoutMs);
    if (!Number.isFinite(ms) || ms <= 0 || silenceTimedOut) return;
    clearSilenceTimer();
    outputSilenceTimer = setTimeout(() => {
      silenceTimedOut = true;
      try {
        subprocess.kill("SIGKILL", { forceKillAfterDelay: 1000 });
      } catch {
        // no-op
      }
    }, ms);
  }

  if (subprocess.stdout) {
    subprocess.stdout.on("data", (chunk) => {
      stdoutAccum += chunk.toString();
      armSilenceTimer();
    });
  }
  if (subprocess.stderr) {
    subprocess.stderr.on("data", (chunk) => {
      stderrAccum += chunk.toString();
      armSilenceTimer();
    });
  }

  let flushInterval = null;
  if (onOutput) {
    const flushMs = Number(partialOutputFlushMs) > 0 ? Number(partialOutputFlushMs) : 2000;
    const streams = {};
    const makeHandler = (stream) => {
      const state = { partial: "", dirty: false };
      streams[stream] = state;
      return (chunk) => {
        state.partial += chunk.toString();
        const lines = state.partial.split(/\r\n|\n|\r/);
        state.partial = lines.pop() ?? "";
        state.dirty = state.partial.length > 0;
        for (const line of lines) {
          if (line) onOutput({ stream, line });
        }
      };
    };

    const flushPartials = () => {
      for (const [stream, state] of Object.entries(streams)) {
        if (!state.dirty || !state.partial) continue;
        onOutput({ stream, line: state.partial });
        state.partial = "";
        state.dirty = false;
      }
    };

    if (subprocess.stdout) subprocess.stdout.on("data", makeHandler("stdout"));
    if (subprocess.stderr) subprocess.stderr.on("data", makeHandler("stderr"));
    flushInterval = setInterval(flushPartials, flushMs);
    flushInterval.unref?.();

    subprocess.finally(() => {
      flushPartials();
      if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = null;
      }
    });
  }
  armSilenceTimer();

  try {
    if (!timeout) {
      const result = await subprocess;
      clearSilenceTimer();
      if (silenceTimedOut) {
        return {
          exitCode: 143,
          stdout: stdoutAccum,
          stderr: `Command killed after ${Number(silenceTimeoutMs)}ms without output`,
          timedOut: true,
          signal: "SIGKILL"
        };
      }
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
    clearSilenceTimer();
    if (silenceTimedOut) {
      return {
        exitCode: 143,
        stdout: stdoutAccum,
        stderr: `Command killed after ${Number(silenceTimeoutMs)}ms without output`,
        timedOut: true,
        signal: "SIGKILL"
      };
    }
    return enrichResult(result, stdoutAccum, stderrAccum);
  } catch (error) {
    clearSilenceTimer();
    if (silenceTimedOut) {
      return {
        exitCode: 143,
        stdout: error?.stdout || stdoutAccum,
        stderr: `Command killed after ${Number(silenceTimeoutMs)}ms without output`,
        timedOut: true,
        signal: error?.signal || "SIGKILL"
      };
    }
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
