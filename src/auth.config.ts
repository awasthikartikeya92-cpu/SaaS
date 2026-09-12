import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no providers here (Credentials needs the Node-only DB
// client), just the pieces the Edge middleware needs to check a session
// cookie. The full config in auth.ts extends this with the Credentials
// provider for use in Node runtime (API routes, server components).
export const authConfig = {
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
