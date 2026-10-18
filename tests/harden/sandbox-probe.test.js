// KJC-TSK-1087: kj harden turns the host sandbox on only where it can start. With
// allowUnsandboxedCommands off, a sandbox that cannot start leaves the session with
// no Bash at all (sandbox pilot, KJC-TSK-1083), so the probe decides first.
import { describe, it, expect } from "vitest";
import { probeSandbox } from "../../src/harden/sandbox.js";

const linux = (over = {}) => ({
  platform: "linux",
  which: (bin) => `/usr/bin/${bin}`,
  run: () => ({ status: 0, stderr: "" }),
  readFile: () => "0\n",
  exists: () => true,
  ...over,
});

describe("probeSandbox", () => {
  it("is ready on Linux when bwrap and socat exist and bwrap creates its namespaces", () => {
    const calls = [];
    const r = probeSandbox(linux({ run: (bin, args) => { calls.push([bin, ...args]); return { status: 0, stderr: "" }; } }));
    expect(r).toEqual({ ok: true });
    expect(calls[0]).toEqual(expect.arrayContaining(["/usr/bin/bwrap", "--unshare-user", "--unshare-net"]));
  });

  it("names each missing tool and how to get it", () => {
    const noBwrap = probeSandbox(linux({ which: (bin) => (bin === "bwrap" ? null : `/usr/bin/${bin}`) }));
    expect(noBwrap.ok).toBe(false);
    expect(noBwrap.reason).toMatch(/bubblewrap/);
    expect(noBwrap.remedy).toMatch(/install/);
    const noSocat = probeSandbox(linux({ which: (bin) => (bin === "socat" ? null : `/usr/bin/${bin}`) }));
    expect(noSocat.reason).toMatch(/socat/);
  });

  it("names the AppArmor restriction when bwrap exists but cannot create a user namespace", () => {
    const r = probeSandbox(linux({
      run: () => ({ status: 1, stderr: "bwrap: setting up uid map: Permission denied" }),
      readFile: () => "1\n",
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/AppArmor/);
    expect(r.remedy).toMatch(/\/etc\/apparmor\.d\/bwrap/);
  });

  it("reports bwrap's own error when no known cause explains it", () => {
    const r = probeSandbox(linux({ run: () => ({ status: 1, stderr: "bwrap: weird failure" }), readFile: () => { throw new Error("ENOENT"); } }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("bwrap: weird failure");
  });

  it("is ready on macOS only when sandbox-exec actually starts a sandbox", () => {
    const exists = (p) => p === "/usr/bin/sandbox-exec";
    expect(probeSandbox({ platform: "darwin", exists, run: () => ({ status: 0, stderr: "" }) })).toEqual({ ok: true });
    const broken = probeSandbox({ platform: "darwin", exists, run: () => ({ status: 71, stderr: "sandbox_apply: Operation not permitted" }) });
    expect(broken.ok).toBe(false);
    expect(broken.reason).toContain("Operation not permitted");
    expect(probeSandbox({ platform: "darwin", exists: () => false }).ok).toBe(false);
  });

  it("is not offered on other platforms", () => {
    const r = probeSandbox({ platform: "win32" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/win32/);
  });
});
