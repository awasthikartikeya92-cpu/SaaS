import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { checkAndRecordSignupAttempt, getClientIp, SignupRateLimitedError } from "@/lib/auth/rate-limit";
import { track } from "@/lib/analytics/track";

const RegisterSchema = z.object({
  name: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  try {
    await checkAndRecordSignupAttempt(ip);
  } catch (err) {
    if (err instanceof SignupRateLimitedError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const parsed = RegisterSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, organizationName, email, password } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({ name: organizationName }).returning();
      const [newUser] = await tx
        .insert(users)
        .values({ email, name, passwordHash, organizationId: org.id })
        .returning();
      return newUser;
    });

    await track("signup", { organizationId: user.organizationId, userId: user.id });

    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (err) {
    // Unique violation on users.email -- the pre-check above isn't atomic
    // with this insert, so a concurrent duplicate signup lands here instead
    // of a raw 500.
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    throw err;
  }
}
