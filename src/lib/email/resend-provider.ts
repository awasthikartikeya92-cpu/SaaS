import type { EmailProvider, EmailMessage } from "./provider";

// Resend's Send Email API (https://api.resend.com/emails) -- chosen because
// docs/launch-checklist.md already named it "the simplest to wire up" among
// email providers when this gap was first documented, and its API is a
// single REST call with no SMTP setup.
//
// I could not verify this against Resend's live API or docs from this
// environment -- api.resend.com is blocked by this sandbox's network
// egress policy (confirmed with a direct curl test, same restriction that
// blocked Tavily, SEC EDGAR, Hunter, and Postgres earlier; it doesn't
// affect the deployed app). Written against Resend's documented, stable
// request/response shape from training knowledge. The first real password
// reset request with RESEND_API_KEY set is the actual test; if it fails,
// check the error text this throws (Resend's own error responses are
// descriptive) against Resend's dashboard/docs directly.
const RESEND_SEND_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export class ResendProvider implements EmailProvider {
  name = "resend";
  constructor(
    private apiKey: string,
    // Resend requires either a verified sending domain or its own
    // onboarding address, which works unverified for any recipient --
    // exactly what a project with no domain set up yet needs to send a
    // real reset email today. Replace this with an address on a domain
    // you've verified in Resend once you have one, for deliverability and
    // sender reputation -- onboarding@resend.dev is meant for getting
    // started, not a long-term production sender.
    private fromAddress: string = "SignalIQ <onboarding@resend.dev>"
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(RESEND_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Resend send returned ${res.status}: ${body.slice(0, 500)}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
