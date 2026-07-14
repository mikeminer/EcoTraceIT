import {describe, expect, it} from "vitest";
import {aggregateEpr, eprCsv} from "./epr.server";

describe("EPR aggregation", () => {
  it("aggrega peso e contenuto riciclato per materiale", () => {
    const report = aggregateEpr([{packagingProfileId: "p1", calculatedAt: new Date()}], [{id: "p1", uniqueIdentifier: "BOX", isReusable: false, components: [{materialCode: "PAP 20", materialName: "Cartone", weightGrams: 200, recycledContentPercent: 80, postConsumerPercent: 50, conaiMaterial: "CARTA", conaiContributionBand: "1", packagingType: "SECONDARY_TERTIARY", conaiClassification: {materialFamily: "CARTA", conaiMaterialCode: "PAP 20", contributionBand: "1", packagingType: "SECONDARY_TERTIARY", contributionEurPerTonne: 65, sourceReference: "CONAI-2026", classificationStatus: "VERIFIED"}}]}]);
    expect(report.rows[0]).toMatchObject({units: 1, grossKg: 0.2, recycledKg: 0.16, postConsumerKg: 0.1, classificationStatus: "VERIFIED", sourceReference: "CONAI-2026"});
    expect(eprCsv(report)).toContain("PAP 20");
  });
});
