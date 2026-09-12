import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      organizationId: string;
    } & DefaultSession["user"];
  }
  interface User {
    organizationId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId: string;
  }
}
