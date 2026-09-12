// Next.js 16 renamed middleware.ts -> proxy.ts; the proxy runtime is Node.js
// (not Edge), so this can safely use the full auth() config (Credentials +
// the better-sqlite3-backed db client) with no split-config workaround.
import { auth } from "@/auth";

export default auth;

export const config = {
  matcher: ["/((?!api|login|signup|_next/static|_next/image|favicon.ico).*)"],
};
