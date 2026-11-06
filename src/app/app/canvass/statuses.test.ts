import { describe, expect, it } from "vitest";
import { guessMapping, mapImportedStatus, parseCsv } from "./statuses";

describe("canvass import helpers", () => {
  it("parses quoted CSV", () => {
    expect(parseCsv('a,b\r\n"1, Main St","He said ""hi"""\n\n2,x')).toEqual([["a", "b"], ["1, Main St", 'He said "hi"'], ["2", "x"]]);
  });
  it("maps SPOTIO / SalesRabbit statuses", () => {
    expect(mapImportedStatus("Not Home")).toBe("not_home");
    expect(mapImportedStatus("Not Interested")).toBe("not_interested");
    expect(mapImportedStatus("Callback")).toBe("come_back");
    expect(mapImportedStatus("Appointment Set")).toBe("inspection_booked");
    expect(mapImportedStatus("Interested")).toBe("interested");
    expect(mapImportedStatus("Sold")).toBe("customer");
    expect(mapImportedStatus("")).toBe("not_home");
  });
  it("guesses columns", () => {
    expect(guessMapping(["Address", "Latitude", "Longitude", "Status", "Notes"])).toEqual({ lat: 1, lng: 2, address: 0, status: 3, notes: 4 });
  });
});
