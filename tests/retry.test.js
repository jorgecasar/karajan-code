import { describe, expect, it, vi } from "vitest";
import { isTransientError, parseRetryAfter, calculateBackoff, withRetry } from "../src/utils/retry.js";

describe("isTransientError", () => {
  it("returns true for HTTP 429", () => {
    expect(isTransientError({ httpStatus: 429, message: "Too Many Requests" })).toBe(true);
  });

  it("returns true for HTTP 502, 503, 504", () => {
    expect(isTransientError({ httpStatus: 502 })).toBe(true);
    expect(isTransientError({ httpStatus: 503 })).toBe(true);
    expect(isTransientError({ httpStatus: 504 })).toBe(true);
  });

  it("returns true for HTTP 408 (timeout)", () => {
    expect(isTransientError({ status: 408 })).toBe(true);
  });

  it("returns false for HTTP 401, 403, 404", () => {
    expect(isTransientError({ httpStatus: 401, message: "Unauthorized" })).toBe(false);
    expect(isTransientError({ httpStatus: 403, message: "Forbidden" })).toBe(false);
    expect(isTransientError({ httpStatus: 404, message: "Not Found" })).toBe(false);
  });

  it("returns true for connection error patterns", () => {
    expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    expect(isTransientError(new Error("File not found"))).toBe(false);
    expect(isTransientError(new Error("Invalid JSON"))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("parses numeric seconds", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter("60")).toBe(60000);
  });

  it("returns null for invalid values", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("0")).toBeNull();
    expect(parseRetryAfter("-1")).toBeNull();
  });

  it("parses HTTP date format", () => {
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    const result = parseRetryAfter(futureDate);
    expect(result).toBeGreaterThan(5000);
    expect(result).toBeLessThanOrEqual(10000);
  });

  it("returns null for past dates", () => {
    const pastDate = new Date(Date.now() - 10000).toUTCString();
    expect(parseRetryAfter(pastDate)).toBeNull();
  });
});

describe("calculateBackoff", () => {
  it("increases exponentially", () => {
    const opts = { initialBackoffMs: 1000, backoffMultiplier: 2, maxBackoffMs: 60000, jitterFactor: 0 };
    expect(calculateBackoff(0, opts)).toBe(1000);
    expect(calculateBackoff(1, opts)).toBe(2000);
    expect(calculateBackoff(2, opts)).toBe(4000);
    expect(calculateBackoff(3, opts)).toBe(8000);
  });

  it("caps at maxBackoffMs", () => {
    const opts = { initialBackoffMs: 1000, backoffMultiplier: 2, maxBackoffMs: 5000, jitterFactor: 0 };
    expect(calculateBackoff(10, opts)).toBe(5000);
  });

  it("adds jitter within bounds", () => {
    const opts = { initialBackoffMs: 1000, backoffMultiplier: 2, maxBackoffMs: 60000, jitterFactor: 0.1 };
    const results = new Set();
    for (let i = 0; i < 20; i++) results.add(calculateBackoff(0, opts));
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { initialBackoffMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid JSON"));
    await expect(withRetry(fn, { initialBackoffMs: 1 })).rejects.toThrow("Invalid JSON");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(withRetry(fn, { maxAttempts: 3, initialBackoffMs: 1 })).rejects.toThrow("ECONNREFUSED");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("ok");
    await withRetry(fn, { initialBackoffMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 0,
      maxAttempts: 3
    }));
  });

  it("respects retryAfter on error object", async () => {
    const error = new Error("ECONNREFUSED");
    error.retryAfter = "1";
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("ok");
    const start = Date.now();
    await withRetry(fn, { initialBackoffMs: 1, maxBackoffMs: 5000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(500);
  });

  it("retries on HTTP 429 error", async () => {
    const error = new Error("Too Many Requests");
    error.httpStatus = 429;
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { initialBackoffMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes attempt number to fn", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce("ok");
    await withRetry(fn, { initialBackoffMs: 1 });
    expect(fn).toHaveBeenNthCalledWith(1, 0);
    expect(fn).toHaveBeenNthCalledWith(2, 1);
  });
});
