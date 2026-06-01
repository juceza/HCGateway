import { describe, expect, it, vi } from "vitest";

import {
  API_DOCS_URL,
  SOVEREIGNTY_BADGE_DETAIL,
  SOVEREIGNTY_BADGE_LABEL,
  formatExpiry,
  performLogout,
} from "./shell";

describe("API_DOCS_URL", () => {
  it("points to the documented REST API URL", () => {
    expect(API_DOCS_URL).toBe("https://hcgateway.shuchir.dev/");
  });
});

describe("sovereignty copy", () => {
  it("frames ownership/control, not a zero-knowledge promise", () => {
    const copy = `${SOVEREIGNTY_BADGE_LABEL} ${SOVEREIGNTY_BADGE_DETAIL}`.toLowerCase();
    // Ownership framing present.
    expect(copy).toContain("your data");
    expect(copy).toContain("your own server");
    // No zero-knowledge / unreadable claims (the server decrypts server-side).
    expect(copy).not.toContain("zero-knowledge");
    expect(copy).not.toContain("zero knowledge");
    expect(copy).not.toContain("can't read");
    expect(copy).not.toContain("cannot read");
    expect(copy).not.toContain("end-to-end");
  });
});

describe("formatExpiry", () => {
  it("formats a future expiry as a human-readable UTC instant, not expired", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const result = formatExpiry("2026-06-01T12:00:00Z", now);
    expect(result.expired).toBe(false);
    expect(result.text).toBe("Jun 1, 2026, 12:00 PM UTC");
  });

  it("marks a past expiry as expired", () => {
    const now = new Date("2026-06-02T00:00:00Z");
    const result = formatExpiry("2026-06-01T12:00:00Z", now);
    expect(result.expired).toBe(true);
  });

  it("treats the exact boundary instant as expired", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(formatExpiry("2026-06-01T12:00:00Z", now).expired).toBe(true);
  });

  it("degrades an unparseable value to Unknown without throwing", () => {
    const result = formatExpiry("not-a-date", new Date("2026-06-01T00:00:00Z"));
    expect(result).toEqual({ text: "Unknown", expired: false });
  });
});

describe("performLogout", () => {
  it("revokes the session, then clears local auth, in that order", async () => {
    const order: string[] = [];
    const revoke = vi.fn(async () => {
      order.push("revoke");
    });
    const clearAuth = vi.fn(() => {
      order.push("clearAuth");
    });

    await performLogout({ revoke, clearAuth });

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["revoke", "clearAuth"]);
  });

  it("still clears local auth when revoke fails (never rejects)", async () => {
    const revoke = vi.fn(async () => {
      throw new Error("network down");
    });
    const clearAuth = vi.fn();

    await expect(performLogout({ revoke, clearAuth })).resolves.toBeUndefined();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(clearAuth).toHaveBeenCalledTimes(1);
  });
});
