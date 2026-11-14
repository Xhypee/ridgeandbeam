import { describe, expect, it } from "vitest";
import { parseAuAddress } from "./address-parse";

describe("parseAuAddress", () => {
  it("splits street, suburb, state and postcode", () => {
    expect(parseAuAddress("Lot 214, Grand Ave, Springfield Lakes QLD 4300")).toEqual({ address: "Lot 214, Grand Ave", city: "Springfield Lakes", state: "QLD", zip: "4300" });
    expect(parseAuAddress("9 Bay Tce, Wynnum qld 4178, Australia")).toEqual({ address: "9 Bay Tce", city: "Wynnum", state: "QLD", zip: "4178" });
  });
  it("reads the saved form with state and postcode as their own parts", () => {
    expect(parseAuAddress("36 Brownvale Street, Logan Central, QLD, 4114")).toEqual({ address: "36 Brownvale Street", city: "Logan Central", state: "QLD", zip: "4114" });
  });
  it("keeps the whole line as the street when it can't tell", () => {
    expect(parseAuAddress("9 Bay Tce")).toEqual({ address: "9 Bay Tce", city: "", state: "", zip: "" });
  });
});
