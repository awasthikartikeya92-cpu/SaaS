# Privacy Policy (DRAFT — attorney review required before publishing)

> This is a founder-drafted starting point, not legal advice. It has not
> been reviewed by a lawyer, and it makes assumptions about how the product
> is architected today (see docs/launch-checklist.md) that will need to be
> re-checked once real infrastructure (database host, AI provider, research
> provider, payment processor) is finalized. If you plan to have users in
> the EU/UK or California, this needs a real GDPR/CCPA review before
> launch — this draft does not attempt that on its own. Placeholders are
> marked `[ ]`.

**Last updated:** September 15, 2026
**Company:** Intrendz Media ("we", "us"). SignalIQ is a proprietary product
of Intrendz Media, currently an unincorporated (sole proprietorship)
business based in India. [Update once Intrendz Media completes formal
incorporation.]

## 1. What this covers

This policy covers information we collect through SignalIQ (the "Service"):
your account, the campaigns you create, and the account/contact
intelligence the Service generates about companies (and, in some cases,
individuals at those companies) as part of that.

## 2. Information we collect

- **Account data:** name, email, password (stored as a bcrypt hash, never
  in plain text), organization.
- **Campaign inputs:** what you tell us about your offering, target
  market, and ICP.
- **Generated data:** AI-generated offering/ICP/signal analysis, account
  scores, and outreach content, plus the underlying evidence (source URLs,
  excerpts) our research and verification agents collect about target
  companies.
- **Usage data:** which features you use, campaign counts, and (see
  src/lib/billing/) AI token usage tied to your organization, used for
  plan/quota enforcement and cost accounting — not for anything beyond
  making the product and billing work correctly.
- **Payment data:** if you're on a paid plan, our payment processor
  (Stripe) handles your card details directly — we don't store full card
  numbers ourselves.

## 3. Information about people who are not our users

Because the Service surfaces public signals and recommended contacts about
prospect companies, we process some information about individuals who
haven't signed up for the Service (e.g., a job title we recommend
targeting, or a public signal mentioning a company). We do not scrape
private data about these individuals ourselves. Where a contact
enrichment provider is configured (currently Hunter.io, opt-in via
`HUNTER_API_KEY` — see `src/lib/contacts/`), the Service purchases access
to that provider's own database of business contact information
(professional titles, work email addresses, and public professional
profile links) to surface a verified, real contact instead of only a
recommended title; this data reflects information the individual or their
employer has made publicly available (e.g., on a company website or
professional profile) and comes to us through the provider's own
compliance process, not our own direct collection. If you are such an
individual and want to know what's held about your company or role,
contact us at
contact@intrendzmedia.com.

## 4. How we use information

To provide the Service (run the agent pipeline, compute scores, generate
reports), to enforce plan limits and bill correctly, to improve the
product, and to communicate with you about your account, billing, or
material changes to these terms/limits.

## 5. AI providers

Campaign generation sends your campaign inputs (and, for research-derived
steps, evidence gathered about target companies) to a third-party AI
provider (currently Anthropic; see `AI_PROVIDER` in the codebase) to
produce structured output. [Confirm and cite the current data-retention /
training-use terms of whichever provider(s) are actually in use before
publishing this — those terms vary and change.]

## 6. Data retention

We retain account and campaign data for as long as your account is active,
plus 90 days after cancellation, after which it's deleted unless we're
required to keep it longer by law. [90 days is a placeholder default, not
a business decision Intrendz Media has made -- adjust freely.] You can
request deletion at contact@intrendzmedia.com.

## 7. Security

Passwords are hashed (bcrypt), and [database encryption at rest / in
transit — confirm once the production database host is chosen]. No method
of transmission or storage is 100% secure.

## 8. Your rights

Depending on where you live, you may have rights to access, correct, export,
or delete your personal data, or to object to certain processing. Contact
contact@intrendzmedia.com to exercise these.

## 9. Changes to this policy

We'll post updates here and notify active users by email of material
changes.

## 10. Contact

Questions about this policy: contact@intrendzmedia.com
