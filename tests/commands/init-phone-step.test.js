// KJC-TSK-0997 (HUM-D4, ADR 0018): kj init explains the phone, what it protects and how to enroll it.
import { describe, expect, it, vi } from "vitest";

import { enrollPendingPhone, offerPhoneEnrollment, tellPhoneStep } from "../../src/commands/init.js";

const lines = (enrolled) => { const out = []; tellPhoneStep({ info: (l) => out.push(l) }, { enrolled }); return out.join("\n"); };

it("without a phone: what is refused, the page, the command from the user's terminal, the recovery code, and the way down", () => {
  const text = lines(false);
  expect(text).toMatch(/level is max by default.*refused until one is enrolled/s);
  expect(text).toMatch(/karajancode\.com\/sign/);
  expect(text).toMatch(/never from an agent session: kj identity enroll-phone <public key>/);
  expect(text).toMatch(/recovery code.*--recovery <code>/);
  expect(text).toMatch(/kj security normal lowers the level from your own terminal/);
});

it("with a phone: says the level is max and what is signed from it", () => {
  expect(lines(true)).toMatch(/A phone is enrolled.*max by default.*kj security show/s);
});

// KJC-TSK-1046 (ADR 0020): with a person at the terminal, init offers to enroll the phone.
describe("offerPhoneEnrollment", () => {
  const wizardOf = ({ yes, key = "" }) => ({ confirm: vi.fn(async () => yes), input: vi.fn(async () => key) });
  const logger = () => { const out = []; return { info: (l) => out.push(l), out }; };

  it("no phone and the person accepts: returns the pasted public key, trimmed", async () => {
    const wizard = wizardOf({ yes: true, key: "  PUBKEY=  " });
    expect(await offerPhoneEnrollment(wizard, logger(), { enrolled: false })).toBe("PUBKEY=");
    expect(wizard.input.mock.calls[0][0]).toMatch(/karajancode\.com\/sign/);
  });

  it("the person declines, or pastes nothing: null, and it says how to do it later", async () => {
    const log = logger();
    expect(await offerPhoneEnrollment(wizardOf({ yes: false }), log, { enrolled: false })).toBeNull();
    expect(await offerPhoneEnrollment(wizardOf({ yes: true, key: "  " }), log, { enrolled: false })).toBeNull();
    expect(log.out.join("\n")).toMatch(/later.*kj identity/);
  });

  it("a phone is already enrolled: it asks nothing", async () => {
    const wizard = wizardOf({ yes: true, key: "X" });
    expect(await offerPhoneEnrollment(wizard, logger(), { enrolled: true })).toBeNull();
    expect(wizard.confirm).not.toHaveBeenCalled();
  });
});

describe("enrollPendingPhone", () => {
  it("enrolls the key through the identity command once the wizard is closed", async () => {
    const enroll = vi.fn(async () => 0);
    expect(await enrollPendingPhone("PUBKEY=", { enroll, logger: { info() {} } })).toBe(true);
    expect(enroll).toHaveBeenCalledWith("PUBKEY=");
  });

  it("a failed enrollment is said and init goes on", async () => {
    const out = [];
    expect(await enrollPendingPhone("BAD", { enroll: async () => 1, logger: { info: (l) => out.push(l) } })).toBe(false);
    expect(out.join("\n")).toMatch(/not enrolled.*kj identity/);
  });

  it("an enrollment that throws is said too, with its reason, and never aborts init", async () => {
    const out = [];
    expect(await enrollPendingPhone("BAD", { enroll: async () => { throw new Error("no tty"); }, logger: { info: (l) => out.push(l) } })).toBe(false);
    expect(out.join("\n")).toMatch(/not enrolled \(no tty\)/);
  });

  it("no key, nothing to do", async () => {
    const enroll = vi.fn();
    expect(await enrollPendingPhone(null, { enroll, logger: { info() {} } })).toBe(false);
    expect(enroll).not.toHaveBeenCalled();
  });
});
