import { db } from "@/lib/db";
import { signupAttempts, passwordResetAttempts } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
// `||` not `??`: Number("") is 0, not NaN -- see the same comment in plans.ts.
const MAX_ATTEMPTS_PER_WINDOW = Number(process.env.SIGNUP_MAX_PER_IP_PER_HOUR || 5);
const MAX_PASSWORD_RESET_ATTEMPTS_PER_WINDOW = Number(process.env.PASSWORD_RESET_MAX_PER_IP_PER_HOUR || 5);

export class SignupRateLimitedError extends Error {
  constructor() {
    super("Too many signups from this network recently. Try again later.");
    this.name = "SignupRateLimitedError";
  }
}

export class PasswordResetRateLimitedError extends Error {
  constructor() {
    super("Too many password reset requests from this network recently. Try again later.");
    this.name = "PasswordResetRateLimitedError";
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Throws SignupRateLimitedError if this IP has already made too many signup
 * attempts in the last hour. Records this attempt regardless of outcome
 * (including a later validation failure) so repeated probing still counts
 * against the limit.
 */
export async function checkAndRecordSignupAttempt(ip: string): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(signupAttempts)
    .where(and(eq(signupAttempts.ipAddress, ip), gte(signupAttempts.createdAt, windowStart)));

  if (count >= MAX_ATTEMPTS_PER_WINDOW) {
    throw new SignupRateLimitedError();
  }

  await db.insert(signupAttempts).values({ ipAddress: ip });
}

/**
 * Same shape as checkAndRecordSignupAttempt above, against a separate table
 * (passwordResetAttempts) so this limit can never interact with signup's --
 * see that table's comment in schema.ts. Guards /api/auth/forgot-password
 * against both volumetric abuse (mass-triggering reset emails) and
 * user-enumeration probing.
 */
export async function checkAndRecordPasswordResetAttempt(ip: string): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(passwordResetAttempts)
    .where(and(eq(passwordResetAttempts.ipAddress, ip), gte(passwordResetAttempts.createdAt, windowStart)));

  if (count >= MAX_PASSWORD_RESET_ATTEMPTS_PER_WINDOW) {
    throw new PasswordResetRateLimitedError();
  }

  await db.insert(passwordResetAttempts).values({ ipAddress: ip });
}
