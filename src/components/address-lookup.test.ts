import { describe, expect, it } from "vitest";
import { partsFromComponents } from "./address-lookup";

const c = (types: string[], longText: string, shortText = longText) => ({ types, longText, shortText });

describe("partsFromComponents", () => {
  it("splits a Google result into street, suburb, state and postcode", () => {
    const p = partsFromComponents([
      c(["street_number"], "9"), c(["route"], "Bay Terrace", "Bay Tce"), c(["locality", "political"], "Wynnum"),
      c(["administrative_area_level_1", "political"], "Queensland", "QLD"), c(["postal_code"], "4178"), c(["country"], "Australia", "AU"),
    ], { lat: -27.44, lng: 153.17 });
    expect(p).toEqual({ address: "9 Bay Terrace", city: "Wynnum", state: "QLD", zip: "4178", lat: -27.44, lng: 153.17 });
  });

  it("keeps the unit number and falls back to sublocality", () => {
    const p = partsFromComponents([
      c(["subpremise"], "4"), c(["street_number"], "12"), c(["route"], "Smith Street", "Smith St"),
      c(["sublocality_level_1", "sublocality"], "Fortitude Valley"), c(["administrative_area_level_1"], "Queensland", "QLD"), c(["postal_code"], "4006"),
    ]);
    expect(p.address).toBe("4/12 Smith Street");
    expect(p.city).toBe("Fortitude Valley");
    expect(p.lat).toBeNull();
  });

  it("leaves the state blank when it isn't an Australian state", () => {
    expect(partsFromComponents([c(["administrative_area_level_1"], "Auckland", "AUK")]).state).toBe("");
  });
});
