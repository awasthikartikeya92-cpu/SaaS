import { describe, it, expect } from "vitest";
import { generateResetToken, hashResetToken, isResetTokenValid, RESET_TOKEN_TTL_MS } from "./password-reset";

describe("generateResetToken", () => {
  it("produces a high-entropy raw token distinct from its own hash", () => {
    const { rawToken, tokenHash } = generateResetToken();
    // 32 bytes as hex = 64 characters.
    expect(rawToken).toHaveLength(64);
    expect(tokenHash).toHaveLength(64); // sha256 hex digest length
    expect(rawToken).not.toBe(tokenHash);
  });

  it("never produces the same raw token twice", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.rawToken).not.toBe(b.rawToken);
  });

  it("sets expiresAt exactly RESET_TOKEN_TTL_MS after the given time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const { expiresAt } = generateResetToken(now);
    expect(expiresAt.getTime()).toBe(now.getTime() + RESET_TOKEN_TTL_MS);
  });

  it("tokenHash is exactly hashResetToken(rawToken) -- the reset endpoint depends on this to look the token up", () => {
    const { rawToken, tokenHash } = generateResetToken();
    expect(hashResetToken(rawToken)).toBe(tokenHash);
  });
});

describe("hashResetToken", () => {
  it("is deterministic -- the same input always hashes the same way", () => {
    expect(hashResetToken("abc123")).toBe(hashResetToken("abc123"));
  });

  it("different tokens hash differently", () => {
    expect(hashResetToken("abc123")).not.toBe(hashResetToken("abc124"));
  });
});

describe("isResetTokenValid", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);

  it("is valid when unused and not yet expired", () => {
    expect(isResetTokenValid({ expiresAt: future, usedAt: null }, now)).toBe(true);
  });

  it("is invalid once used, even if not yet expired", () => {
    expect(isResetTokenValid({ expiresAt: future, usedAt: past }, now)).toBe(false);
  });

  it("is invalid once expired, even if never used", () => {
    expect(isResetTokenValid({ expiresAt: past, usedAt: null }, now)).toBe(false);
  });

  it("is invalid when both used and expired", () => {
    expect(isResetTokenValid({ expiresAt: past, usedAt: past }, now)).toBe(false);
  });
});
