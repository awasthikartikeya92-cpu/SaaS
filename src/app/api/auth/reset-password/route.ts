import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { hashResetToken, isResetTokenValid } from "@/lib/auth/password-reset";

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const parsed = ResetPasswordSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a password of at least 8 characters." }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const tokenHash = hashResetToken(token);
  const [record] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);

  // Deliberately one generic message for "no such token", "already used",
  // and "expired" -- distinguishing them tells an attacker holding a stale
  // or guessed token more than they should learn (e.g. that a token they
  // don't have the raw value for was, at some point, real and used).
  if (!record || !isResetTokenValid(record)) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
    // Marks this token used AND invalidates every other outstanding token
    // for this user in one statement -- if an older reset email leaked, it
    // must not still work after the password has already been changed via
    // a different link.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, record.userId), isNull(passwordResetTokens.usedAt)));
  });

  return NextResponse.json({ ok: true });
}
