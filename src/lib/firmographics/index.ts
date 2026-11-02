import type { FirmographicsProvider } from "./provider";
import { TavilyFirmographicsProvider } from "./tavily-firmographics-provider";

// `undefined` = not yet resolved; `null` = resolved, deliberately no
// provider configured -- same distinction as src/lib/contacts/index.ts's
// factory, for the same reason: this is optional enrichment layered on a
// pipeline that already works without it (accounts just keep the
// placeholder industry and no size/revenue), not a required stage.
let cached: FirmographicsProvider | null | undefined;

export function getFirmographicsProvider(): FirmographicsProvider | null {
  if (cached !== undefined) return cached;

  // Same auto-detect convention as src/lib/research/index.ts: reuses
  // TAVILY_API_KEY (a campaign already needs this for real research) --
  // no separate key or flag to opt in, since the same credential already
  // says what you want. FIRMOGRAPHICS_PROVIDER="none" opts back out
  // explicitly (e.g. to control cost independently of research).
  const explicit = (process.env.FIRMOGRAPHICS_PROVIDER || "").toLowerCase().trim();
  if (explicit === "none") {
    cached = null;
    return cached;
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey && (explicit === "" || explicit === "tavily")) {
    cached = new TavilyFirmographicsProvider(tavilyKey);
    return cached;
  }

  cached = null;
  return cached;
}

export type { FirmographicsProvider, FirmographicsQuery, FirmographicsResult } from "./provider";
