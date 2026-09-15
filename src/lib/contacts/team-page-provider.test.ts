import { describe, it, expect } from "vitest";
import { findTeamPageLink, extractReadableText } from "./team-page-provider";

describe("findTeamPageLink", () => {
  it("picks a link whose href names a team-like page", () => {
    const html = `<nav><a href="/products">Products</a><a href="/about/team">Team</a><a href="/contact">Contact</a></nav>`;
    expect(findTeamPageLink(html, "https://acme.com")).toBe("https://acme.com/about/team");
  });

  it("picks a link by its visible text even when the href doesn't name it", () => {
    const html = `<a href="/company-info">Meet Our Leadership</a>`;
    expect(findTeamPageLink(html, "https://acme.com")).toBe("https://acme.com/company-info");
  });

  it("resolves a relative href against the given base URL", () => {
    const html = `<a href="team">Team</a>`;
    expect(findTeamPageLink(html, "https://acme.com/")).toBe("https://acme.com/team");
  });

  it("prefers the higher-scoring link when both href and text match", () => {
    const html = `<a href="/blog">About the founders</a><a href="/team">Team</a>`;
    // "/team" scores on href (2) + text (1) = 3; "/blog" scores on text
    // only ("about" -> 1) = 1 -- the href match should win.
    expect(findTeamPageLink(html, "https://acme.com")).toBe("https://acme.com/team");
  });

  it("returns null when nothing on the page looks team-related", () => {
    const html = `<a href="/products">Products</a><a href="/pricing">Pricing</a>`;
    expect(findTeamPageLink(html, "https://acme.com")).toBeNull();
  });

  it("skips a malformed href rather than throwing", () => {
    const html = `<a href=":::not a url">Team</a><a href="/team">Team</a>`;
    expect(findTeamPageLink(html, "https://acme.com")).toBe("https://acme.com/team");
  });
});

describe("extractReadableText", () => {
  it("strips script, style, nav, and footer content", () => {
    const html = `
      <html><body>
        <nav>Home | About | Contact</nav>
        <script>trackPageView();</script>
        <style>.hero { color: red; }</style>
        <main>Jane Doe is our VP of Sales.</main>
        <footer>&copy; 2026 Acme Corp</footer>
      </body></html>
    `;
    const text = extractReadableText(html);
    expect(text).toContain("Jane Doe is our VP of Sales.");
    expect(text).not.toContain("trackPageView");
    expect(text).not.toContain("color: red");
    expect(text).not.toContain("Home | About | Contact");
    expect(text).not.toContain("2026 Acme Corp");
  });

  it("collapses whitespace into single spaces", () => {
    const html = `<body>Jane   Doe\n\nis   our    VP</body>`;
    expect(extractReadableText(html)).toBe("Jane Doe is our VP");
  });

  it("truncates very long pages rather than returning unbounded text", () => {
    const longText = "word ".repeat(10_000);
    const html = `<body>${longText}</body>`;
    expect(extractReadableText(html).length).toBeLessThanOrEqual(6_000);
  });
});
