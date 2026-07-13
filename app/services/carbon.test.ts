import {describe, expect, it} from "vitest";
import {calculateCarbon, estimateDistance} from "./carbon.server";
import {suggestPackaging} from "./packaging.server";

describe("EcoPack calculation", () => {
  it("uses Italian CAP distance bands", () => {
    expect(estimateDistance("IT", "20100")).toBe(180);
    expect(estimateDistance("IT", "90100")).toBeGreaterThan(500);
  });
  it("increases with weight", async () => {
    const light = await calculateCarbon({weightGrams: 500, destinationCountry: "IT"});
    const heavy = await calculateCarbon({weightGrams: 5000, destinationCountry: "IT"});
    expect(heavy.emissionsKg).toBeGreaterThan(light.emissionsKg);
  });
  it("selects packaging safely", () => {
    expect(suggestPackaging({weightGrams: 300, itemCount: 1}).code).toBe("RECYCLED_MAILER_S");
    expect(suggestPackaging({weightGrams: 300, itemCount: 1, fragile: true}).code).toBe("FSC_BOX_S");
  });
});