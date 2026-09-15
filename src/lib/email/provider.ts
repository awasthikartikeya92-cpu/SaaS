// Email provider abstraction -- same shape and reasoning as
// src/lib/research/provider.ts and src/lib/contacts/provider.ts: one
// interface, a real implementation behind an env-var switch, a working
// default when nothing is configured, and nothing above this layer caring
// which is active.
//
// Unlike Research and Contact enrichment (which throw or return null when
// unconfigured, since AI generation and contact matching are optional-but-
// gated features), email defaults to a provider that always "succeeds"
// (ConsoleEmailProvider) rather than throwing -- there's no safe way to
// fail a password-reset request loudly to the requester without confirming
// or denying that their email has an account (see the enumeration-safety
// comment in src/lib/auth/password-reset.ts), so the fallback has to be a
// provider that works, just not usefully for a real end user, rather than
// an error.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<void>;
}
