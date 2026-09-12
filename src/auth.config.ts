import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no providers here (Credentials needs the Node-only DB
// client), just the pieces the Edge middleware needs to check a session
// cookie. The full config in auth.ts extends this with the Credentials
// provider for use in Node runtime (API routes, server components).
export const authConfig = {
  // NextAuth v5 standardized on AUTH_SECRET but this app's env files (and
  // Vercel project) only ever set NEXTAUTH_SECRET -- some v5 beta releases
  // don't reliably auto-detect the legacy name, which surfaces as a
  // "Configuration"/MissingSecret error at sign-in time. Passing it
  // explicitly works regardless of which name is actually set.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.organizationId = (user as { organizationId: string }).organizationId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.organizationId = token.organizationId as string;
        session.user.id = token.sub as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
