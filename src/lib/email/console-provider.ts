import type { EmailProvider, EmailMessage } from "./provider";

/**
 * The default when no real email provider is configured. Logs the message
 * to the server's own logs (Vercel's Runtime Logs in production, the
 * terminal in local dev) instead of sending anything -- genuinely useful
 * for local development and for confirming the reset flow's logic works
 * end-to-end, but NOT a working delivery mechanism for a real user: they
 * will never see this. Set RESEND_API_KEY (see resend-provider.ts) before
 * relying on password reset for real users -- see docs/launch-checklist.md.
 */
export class ConsoleEmailProvider implements EmailProvider {
  name = "console";

  async send(message: EmailMessage): Promise<void> {
    console.log(
      `[email:console] No real email provider configured (set RESEND_API_KEY) -- would have sent:\n` +
        `  To: ${message.to}\n  Subject: ${message.subject}\n  Body:\n${message.text}`
    );
  }
}
