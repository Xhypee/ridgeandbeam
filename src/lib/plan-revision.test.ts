import { describe, expect, it } from "vitest";
import { isNewerRevision, revisionRank } from "./plan-revision";

describe("plan revisions", () => {
  it("reads the usual ways revisions are written", () => {
    expect(revisionRank("Rev C")).toBe(3);
    expect(revisionRank("Issue B")).toBe(2);
    expect(revisionRank("R2")).toBe(2);
    expect(revisionRank("Revision 3")).toBe(3);
    expect(revisionRank(null)).toBeNull();
  });
  it("an older revision uploaded later doesn't win", () => {
    expect(isNewerRevision("Rev B", "Rev C")).toBe(false);
    expect(isNewerRevision("Rev D", "Rev C")).toBe(true);
    expect(isNewerRevision(null, "Rev C")).toBe(true);
  });
});
