import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/app/customers/actions", () => ({ searchCustomers: vi.fn() }));
import { looksComplete, prefillFrom } from "./customer-lookup";

describe("prefillFrom", () => {
  it("puts an email in Email, a number in Mobile, anything else in Name", () => {
    expect(prefillFrom("priya@example.com")).toEqual({ name: "", phone: "", email: "priya@example.com" });
    expect(prefillFrom("0491 570 313")).toEqual({ name: "", phone: "0491 570 313", email: "" });
    expect(prefillFrom("+61 491 570 313")).toEqual({ name: "", phone: "+61 491 570 313", email: "" });
    expect(prefillFrom("  Priya Sharma ")).toEqual({ name: "Priya Sharma", phone: "", email: "" });
  });
});

describe("looksComplete", () => {
  it("is true for a full name, an email or a full mobile", () => {
    expect(looksComplete("Priya Sh")).toBe(true);
    expect(looksComplete("priya@example.com")).toBe(true);
    expect(looksComplete("0491 570 31")).toBe(true);
  });
  it("is false while they're still typing one word or a short number", () => {
    expect(looksComplete("Priy")).toBe(false);
    expect(looksComplete("priya@")).toBe(false);
    expect(looksComplete("0491 5")).toBe(false);
  });
});
