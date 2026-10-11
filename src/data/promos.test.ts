import { describe, expect, it } from "vitest";
import { BUNDLED_FEED, parseFeed, parsePromo } from "./promos";

const base = { id: "news", title: "Title", url: "https://example.org", targets: ["huallet"] };

describe("promos feed", () => {
  it("parses the bundled copy", () => {
    expect(parseFeed(BUNDLED_FEED).map((p) => p.id)).toEqual(["dogtags", "predict", "burn"]);
  });

  it("keeps only Huallet entries with a safe https link", () => {
    expect(parsePromo({ ...base, targets: ["explorer"] })).toBeNull();
    expect(parsePromo({ ...base, url: "javascript:alert(1)" })).toBeNull();
    expect(parsePromo({ ...base, url: "http://example.org" })).toBeNull();
    expect(parsePromo({ ...base, id: "Bad Id" })).toBeNull();
    expect(parsePromo(base)?.cta).toBe("Learn more");
  });

  it("honours weight 0 and the date window", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    expect(parsePromo({ ...base, weight: 0 }, now)).toBeNull();
    expect(parsePromo({ ...base, start: "2026-10-12" }, now)).toBeNull();
    expect(parsePromo({ ...base, end: "2026-10-01" }, now)).toBeNull();
    expect(parsePromo({ ...base, start: "2026-10-01", end: "2026-10-31" }, now)?.id).toBe("news");
  });

  it("falls back to a default icon and accent, and drops duplicate ids", () => {
    const p = parsePromo({ ...base, icon: "nope", accent: "red" });
    expect(p?.accent).toBe("#F0A841");
    expect(p?.icon).toBeTruthy();
    expect(parseFeed({ promos: [base, { ...base, title: "Again" }] })).toHaveLength(1);
    expect(parseFeed({ nope: 1 })).toEqual([]);
  });
});
