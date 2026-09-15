import * as cheerio from "cheerio";
import type { ContactEnrichmentProvider, ContactLookupQuery, EnrichedContact } from "./provider";
import { getAiProvider } from "@/lib/ai";
import { getModelForAgent } from "@/lib/ai/model-config";
import { parseJson } from "@/lib/agents/schemas";
import { z } from "zod";

// The most genuinely "OSINT" of this pipeline's contact sources: a company
// publishes who works there and what they do, on its own website,
// specifically to be found -- no API key, no signup, no third-party data
// broker. Fetches the company's own About/Team/Leadership page (or the
// homepage, for a small company that just lists its founders there) and
// asks a cheap model to extract real name+title pairs actually present in
// that text -- extraction grounded in given source text, never invention,
// same discipline as every other agent in this codebase (see
// contact-agent.ts's own "never invent a person's name" rule, which this
// doesn't relax: the model here is told to report only what's written, not
// to guess at anyone's role).
//
// The real tradeoff, stated plainly: coverage is inconsistent. A polished
// company will have a full leadership page with titles; plenty of small
// companies have no team page at all, or a page with photos and names but
// no titles. Composed with Hunter/Google-search (see composite-provider.ts)
// specifically because each source covers accounts the others miss, not
// because any one of them is reliable alone.
const FETCH_TIMEOUT_MS = 6_000;
const USER_AGENT = "SignalIQ-ContactResearch/1.0 (+https://github.com/awasthikartikeya92-cpu/SaaS)";
const MAX_TEXT_CHARS = 6_000;
// Flat, honestly conservative -- there's no independent verification here
// (no deliverable-email check the way Hunter provides), just "this name and
// title are written on the company's own public page." Lower than Hunter's
// typical hits, still usable against rank.ts's default 50% floor.
const CONFIDENCE = 0.65;

const CANDIDATE_PATHS = ["/about", "/about-us", "/team", "/our-team", "/leadership", "/company/team", "/meet-the-team", "/who-we-are"];

// Keywords that make a homepage link worth following as a likely team page
// -- checked against both the link's href and its visible text, since sites
// vary on which one actually names the page.
const TEAM_LINK_KEYWORDS = ["team", "about", "leadership", "people", "who-we-are", "meet-the"];

const ExtractedPersonSchema = z.array(z.object({ name: z.string(), title: z.string() })).catch([]);

const SYSTEM = `You extract real people mentioned in a company webpage's text. Report ONLY people
whose name AND job title are BOTH explicitly written in the given text -- never infer, guess, or
invent a title for someone whose role isn't stated, and never include a person named without a
title or a title without a name attached to it. If no one in the text has both, return an empty
list. Respond with ONLY a JSON array: [{ "name": string, "title": string }]`;

export class TeamPageProvider implements ContactEnrichmentProvider {
  name = "team-page";

  async findContacts({ domain, companyName }: ContactLookupQuery): Promise<EnrichedContact[]> {
    const baseUrl = `https://${domain}`;
    const homepageHtml = await fetchText(baseUrl);
    if (!homepageHtml) return [];

    const teamPageUrl = findTeamPageLink(homepageHtml, baseUrl);
    const pageHtml = teamPageUrl ? await tryTeamPageCandidates(baseUrl, teamPageUrl) : await tryTeamPageCandidates(baseUrl, null);

    const text = extractReadableText(pageHtml ?? homepageHtml);
    if (text.length < 100) return []; // too little content to plausibly name anyone with a title

    const raw = await getAiProvider().complete({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Company: ${companyName}\n\nWebpage text:\n${text}`,
        },
      ],
      model: getModelForAgent("contact-page-extraction"),
    });

    const people = parseJson(raw, ExtractedPersonSchema);
    return people
      .filter((p) => p.name.trim() && p.title.trim())
      .map((p) => ({
        name: p.name.trim(),
        title: p.title.trim(),
        email: null,
        linkedinUrl: null,
        confidence: CONFIDENCE,
      }));
  }
}

/** Tries the homepage-discovered link first (if any), then a bounded, parallel guess at common paths -- whichever resolves with real content wins. Never sequential-escalates across all guesses, to keep this bounded. */
async function tryTeamPageCandidates(baseUrl: string, discoveredUrl: string | null): Promise<string | null> {
  if (discoveredUrl) {
    const html = await fetchText(discoveredUrl);
    if (html) return html;
  }

  const guesses = await Promise.allSettled(CANDIDATE_PATHS.map((path) => fetchText(`${baseUrl}${path}`)));
  for (const result of guesses) {
    if (result.status === "fulfilled" && result.value) return result.value;
  }
  return null;
}

export function findTeamPageLink(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  let best: { url: string; score: number } | null = null;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().toLowerCase();
    const hrefLower = href.toLowerCase();
    const score = TEAM_LINK_KEYWORDS.reduce((n, kw) => n + (hrefLower.includes(kw) ? 2 : 0) + (text.includes(kw) ? 1 : 0), 0);
    if (score === 0) return;

    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      return; // malformed href -- skip
    }
    if (!best || score > best.score) best = { url: resolved, score };
  });

  return best ? (best as { url: string; score: number }).url : null;
}

/** Strips script/style/nav/footer noise and collapses whitespace -- a cheap approximation of "the readable content of this page," not a full readability algorithm. */
export function extractReadableText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_TEXT_CHARS);
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null; // don't try to parse a PDF/image as a webpage
    return await res.text();
  } catch {
    return null; // a single candidate page failing to load isn't an error worth surfacing -- there are other candidates
  } finally {
    clearTimeout(timeout);
  }
}
