import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkAndRecordPasswordResetAttempt, getClientIp, PasswordResetRateLimitedError } from "@/lib/auth/rate-limit";
import { generateResetToken } from "@/lib/auth/password-reset";
import { getEmailProvider } from "@/lib/email";

const ForgotPasswordSchema = z.object({ email: z.string().email().max(320) });

// Always the exact same response, on every path below (unknown email,
// malformed input recovered from, rate limit aside) except a genuine rate
// limit -- an attacker must never be able to use response differences here
// to learn which emails have accounts (user enumeration). The one
// legitimate exception is the 429: rate-limit responses are expected to
// differ from success everywhere they're used in this app (see
// /api/auth/register), and a network-level throttle message doesn't itself
// confirm or deny anything about a specific email.
function genericResponse() {
  return NextResponse.json({ message: "If an account exists for that email, a reset link has been sent." });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  try {
    await checkAndRecordPasswordResetAttempt(ip);
  } catch (err) {
    if (err instanceof PasswordResetRateLimitedError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const parsed = ForgotPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return genericResponse(); // don't leak validation detail either -- see the comment above

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user) return genericResponse();

  const { rawToken, tokenHash, expiresAt } = generateResetToken();
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt });

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  try {
    await getEmailProvider().send({
      to: user.email,
      subject: "Reset your SignalIQ password",
      text:
        `Someone requested a password reset for your SignalIQ account.\n\n` +
        `Reset your password: ${resetUrl}\n\n` +
        `This link expires in 1 hour and can only be used once. If you didn't request this, ` +
        `you can safely ignore this email -- your password will not be changed.`,
    });
  } catch (err) {
    // A delivery failure (a flaky/misconfigured provider) must not turn
    // into a 500 that tells the caller whether the lookup above succeeded
    // -- log it server-side and still return the generic response.
    console.error("[forgot-password] failed to send reset email:", err);
  }

  return genericResponse();
}
