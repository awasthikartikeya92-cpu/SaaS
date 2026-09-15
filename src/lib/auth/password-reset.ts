import crypto from "node:crypto";

// Pulled out as its own dependency-free module -- same reasoning as
// src/lib/agents/stage-decision.ts: this is the one piece of the reset flow
// with real security logic in it (token generation, hashing, validity), so
// it needs to be testable without a live database connection, and reused
// identically by both /api/auth/forgot-password (issues) and
// /api/auth/reset-password (verifies).

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface GeneratedResetToken {
  /** Goes into the emailed link -- never stored anywhere. */
  rawToken: string;
  /** What actually gets stored in password_reset_tokens.token_hash. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * A fresh, single-use reset token. 256 bits of randomness (crypto.randomBytes,
 * not Math.random) -- infeasible to guess or brute-force, the same standard
 * a session token or API key would use.
 */
export function generateResetToken(now: Date = new Date()): GeneratedResetToken {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return {
    rawToken,
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  };
}

/**
 * Deliberately plain SHA-256, not bcrypt -- unlike a user's chosen password
 * (low entropy, needs bcrypt's deliberate slowness to resist offline
 * guessing), a reset token is already 256 bits of real randomness. Bcrypt
 * would add meaningful latency to every password-reset request for no
 * security benefit against an input space this large; a fast, deterministic
 * hash is the right tool here, the same way it would be for hashing an API
 * key. Deterministic on purpose too: the reset endpoint has to hash the
 * token it's given and look up that exact hash, which a salted hash
 * (bcrypt) can't do without storing the salt separately anyway.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** A token record is usable if it hasn't been used yet and hasn't expired. */
export function isResetTokenValid(record: { expiresAt: Date; usedAt: Date | null }, now: Date = new Date()): boolean {
  return record.usedAt === null && record.expiresAt.getTime() > now.getTime();
}
