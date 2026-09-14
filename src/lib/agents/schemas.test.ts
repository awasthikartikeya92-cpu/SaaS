import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJson, ContactRecommendationSchema } from "./schemas";

const SimpleSchema = z.object({ a: z.number(), b: z.string() });

describe("parseJson / extractFirstJsonValue", () => {
  it("parses a clean JSON object", () => {
    expect(parseJson('{"a": 1, "b": "x"}', SimpleSchema)).toEqual({ a: 1, b: "x" });
  });

  it("ignores a markdown code fence around the JSON", () => {
    const raw = '```json\n{"a": 1, "b": "x"}\n```';
    expect(parseJson(raw, SimpleSchema)).toEqual({ a: 1, b: "x" });
  });

  it("ignores leading prose before the JSON", () => {
    const raw = 'Here\'s the recommendation:\n{"a": 1, "b": "x"}';
    expect(parseJson(raw, SimpleSchema)).toEqual({ a: 1, b: "x" });
  });

  it("ignores trailing prose after the JSON -- the real production failure this was built for (Contact Agent, fast-tier model)", () => {
    const raw = '{"a": 1, "b": "x"}\n\nLet me know if you need anything else!';
    expect(parseJson(raw, SimpleSchema)).toEqual({ a: 1, b: "x" });
  });

  it("finds the correct closing brace when a string value contains braces", () => {
    const raw = '{"a": 1, "b": "a {literal} brace inside a string"}';
    expect(parseJson(raw, SimpleSchema)).toEqual({ a: 1, b: "a {literal} brace inside a string" });
  });

  it("finds the correct closing brace when a string value contains an escaped quote", () => {
    const raw = '{"a": 1, "b": "she said \\"hello\\""}';
    expect(parseJson(raw, SimpleSchema)).toEqual({ a: 1, b: 'she said "hello"' });
  });

  it("handles a top-level array", () => {
    const ArraySchema = z.array(z.number());
    expect(parseJson("prose first [1, 2, 3] prose after", ArraySchema)).toEqual([1, 2, 3]);
  });

  it("throws a clear error when no JSON is present at all", () => {
    expect(() => parseJson("just some prose, no JSON here", SimpleSchema)).toThrow(/No JSON/);
  });

  it("throws a clear error on an unterminated JSON value", () => {
    expect(() => parseJson('{"a": 1, "b": "x"', SimpleSchema)).toThrow(/Unterminated/);
  });
});

describe("defensive schema primitives (via ContactRecommendationSchema)", () => {
  it("coerces a 0-100 confidence scale down to 0-1 -- a common model confusion", () => {
    const parsed = ContactRecommendationSchema.parse({
      name: null,
      title: "VP of Ops",
      isVerified: false,
      confidence: 85, // model answered on a 0-100 scale
      relevance: "owns this",
      sourceUrls: [],
    });
    expect(parsed.confidence).toBeCloseTo(0.85);
  });

  it("leaves an already-0-1 confidence alone", () => {
    const parsed = ContactRecommendationSchema.parse({
      name: null,
      title: "VP of Ops",
      isVerified: false,
      confidence: 0.85,
      relevance: "owns this",
      sourceUrls: [],
    });
    expect(parsed.confidence).toBeCloseTo(0.85);
  });

  it("degrades a wrong-shaped array field to [] instead of failing the whole record", () => {
    const parsed = ContactRecommendationSchema.parse({
      name: null,
      title: "VP of Ops",
      isVerified: false,
      confidence: 0.6,
      relevance: "owns this",
      sourceUrls: "not-an-array", // wrong shape
    });
    expect(parsed.sourceUrls).toEqual([]);
  });

  it("normalizes an omitted nullable field to null rather than undefined", () => {
    const parsed = ContactRecommendationSchema.parse({
      title: "VP of Ops",
      isVerified: false,
      confidence: 0.6,
      relevance: "owns this",
      sourceUrls: [],
      // `name` omitted entirely
    });
    expect(parsed.name).toBeNull();
  });
});
