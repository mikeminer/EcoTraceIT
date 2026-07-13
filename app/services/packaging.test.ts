import {describe, expect, it} from "vitest";
import {suggestPackaging} from "./packaging.server";

describe("EcoTraceIT packaging suggestions", () => {
  it("uses a recycled mailer for small non-fragile orders", () => {
    const result = suggestPackaging({weightGrams: 300, itemCount: 1});
    expect(result.code).toBe("RECYCLED_MAILER_S");
    expect(result.recycledContent).toBeGreaterThanOrEqual(80);
  });

  it("uses a small FSC box for standard orders", () => {
    const result = suggestPackaging({weightGrams: 1200, itemCount: 3});
    expect(result.code).toBe("FSC_BOX_S");
    expect(result.labelIt).toContain("PAP 20");
    expect(result.labelEn).toContain("Paper collection");
  });

  it("uses a medium FSC box for heavier orders", () => {
    const result = suggestPackaging({weightGrams: 4500, itemCount: 4});
    expect(result.code).toBe("FSC_BOX_M");
    expect(result.dimensionsCm).toEqual([40, 30, 20]);
    expect(result.estimatedSavingsKg).toBeGreaterThan(0);
  });
});
