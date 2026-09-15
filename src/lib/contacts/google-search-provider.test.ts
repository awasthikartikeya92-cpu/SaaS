import { describe, it, expect } from "vitest";
import { parseLinkedInResultTitle } from "./google-search-provider";

describe("parseLinkedInResultTitle", () => {
  it("parses the 'Name - Title - Company | LinkedIn' shape", () => {
    expect(parseLinkedInResultTitle("John Doe - VP of Operations - Acme Corp | LinkedIn")).toEqual({
      name: "John Doe",
      title: "VP of Operations",
    });
  });

  it("parses the 'Name - Title at Company | LinkedIn' shape", () => {
    expect(parseLinkedInResultTitle("Jane Smith - Director of Sales at Acme Corp | LinkedIn")).toEqual({
      name: "Jane Smith",
      title: "Director of Sales",
    });
  });

  it("does not misfire on a hyphenated title word (no spaces around that hyphen)", () => {
    expect(parseLinkedInResultTitle("Alex Lee - Co-Founder - Acme Corp | LinkedIn")).toEqual({
      name: "Alex Lee",
      title: "Co-Founder",
    });
  });

  it("returns null for 'Name - Company | LinkedIn' -- no title segment present", () => {
    // This is the common, unusable case: a name and a company with nothing
    // in between naming an actual role. Never guess a title here.
    expect(parseLinkedInResultTitle("John Doe - Acme Corp | LinkedIn")).toBeNull();
  });

  it("returns null for a bare 'Name | LinkedIn' result", () => {
    expect(parseLinkedInResultTitle("John Doe | LinkedIn")).toBeNull();
  });

  it("works without a trailing '| LinkedIn' suffix too", () => {
    expect(parseLinkedInResultTitle("John Doe - VP of Operations - Acme Corp")).toEqual({
      name: "John Doe",
      title: "VP of Operations",
    });
  });
});
