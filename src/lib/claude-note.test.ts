import { describe, expect, it } from "vitest";
import { parseClaudeNote } from "./claude-note";

describe("parseClaudeNote", () => {
  it("reads the sections back", () => {
    const n = parseClaudeNote('Read "Plans-RevB.pdf" · Plans\nPlans for a new house\n\nAdded\n- Roof Colorbond Trimdek 0.42 BMT\n- Quote priced from your price book\n\nCheck\n- Wind class N3 to be confirmed\n\nDetails\n- Hip roof, 600 mm eaves');
    expect(n).toEqual({ file: "Plans-RevB.pdf", kind: "Plans", summary: "Plans for a new house", added: ["Roof Colorbond Trimdek 0.42 BMT", "Quote priced from your price book"],
      check: ["Wind class N3 to be confirmed"], details: ["Hip roof, 600 mm eaves"], nothing: false });
  });
  it("knows when there was nothing to add", () => {
    expect(parseClaudeNote('Read "a.jpg" · Photo\nNothing new to add to the job.')?.nothing).toBe(true);
  });
  it("leaves other notes alone", () => {
    expect(parseClaudeNote("Called, will send plans tomorrow")).toBeNull();
    expect(parseClaudeNote('Claude read "a.pdf" (plans). Filled in: roof area.')).toBeNull();
    expect(parseClaudeNote('Read "a.pdf" · Plans\nSummary\nanother loose line')).toBeNull();
  });
});
