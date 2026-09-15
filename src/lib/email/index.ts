import type { EmailProvider } from "./provider";
import { ConsoleEmailProvider } from "./console-provider";
import { ResendProvider } from "./resend-provider";

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || undefined;
  cached = key ? new ResendProvider(key, fromAddress) : new ConsoleEmailProvider();
  return cached;
}

export type { EmailProvider, EmailMessage } from "./provider";
