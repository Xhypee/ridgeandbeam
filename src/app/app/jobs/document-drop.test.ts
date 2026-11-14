import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("./[id]/files/actions", () => ({ attachJobFile: vi.fn(), prepareJobUpload: vi.fn() }));
import { skipFile } from "./document-drop";

describe("skipFile", () => {
  it("skips hidden and system files anywhere in a dragged folder", () => {
    expect(skipFile(".DS_Store")).toBe(true);
    expect(skipFile("Plans/.DS_Store")).toBe(true);
    expect(skipFile("Photos/Thumbs.db")).toBe(true);
    expect(skipFile("__MACOSX/Plans/a.pdf")).toBe(true);
    expect(skipFile("Plans/.git/config")).toBe(true);
  });
  it("keeps real files", () => {
    expect(skipFile("Plans/Roof plan.pdf")).toBe(false);
    expect(skipFile("Quote v2.docx")).toBe(false);
  });
});
