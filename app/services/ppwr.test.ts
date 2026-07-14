import {describe, expect, it} from "vitest";
import {calculateEmptySpaceRatio, evaluatePpwr, validateProfileInput, type ProfileData} from "./ppwr.server";

const operator = {
  economicRole: "MANUFACTURER",
  legalName: "Eco Merchant S.r.l.",
  streetAddress: "Via Roma 1",
  postalCode: "20100",
  city: "Milano",
  countryCode: "IT",
  contactEmail: "compliance@example.com",
};

const evidence = (evidenceType: string) => ({evidenceType, title: evidenceType, reference: `REF-${evidenceType}`});

const completeProfile: ProfileData = {
  uniqueIdentifier: "BOX-001",
  version: 1,
  name: "Scatola e-commerce piccola",
  intendedUse: "Consegna di prodotti tessili al consumatore finale",
  packagingLevel: "ECOMMERCE",
  status: "READY_FOR_DECLARATION",
  isReusable: false,
  foodContact: false,
  packagingWeightGrams: 100,
  lengthMm: 200,
  widthMm: 200,
  heightMm: 100,
  productVolumeCm3: 2400,
  emptySpaceRatio: 40,
  substancesStatus: "VERIFIED",
  recyclabilityStatus: "VERIFIED",
  recyclabilityGrade: "A",
  recycledContentStatus: "VERIFIED",
  compostabilityStatus: "NOT_APPLICABLE",
  labelStatus: "VERIFIED",
  minimisationAssessment: "Valutati formato, resistenza e protezione; non sono presenti strati superflui.",
  riskAssessment: "Analizzati contaminazione, rottura, migrazione e perdita di prestazioni durante trasporto e stoccaggio.",
  manufacturingControls: "Controllo peso, spessore, incollaggio e lotto per ogni produzione con registrazione delle non conformità.",
  harmonisedStandards: "EN 13427; EN 13430",
  components: [{
    materialCode: "PAP 20", materialName: "Cartone ondulato", function: "Corpo scatola", weightGrams: 100,
    recycledContentPercent: 85, postConsumerPercent: 80, recyclingStream: "Carta", supplierDeclarationRef: "SUP-1",
  }],
  evidence: [
    evidence("TECHNICAL_DRAWING"), evidence("SUPPLIER_DECLARATION"), evidence("SUBSTANCES_TEST"),
    evidence("RECYCLABILITY_ASSESSMENT"), evidence("TEST_REPORT"), evidence("LABEL_ARTWORK"),
  ],
};

describe("PPWR geometry", () => {
  it("calculates packaging volume and empty-space ratio", () => {
    expect(calculateEmptySpaceRatio(200, 200, 100, 2400)).toEqual({packagingVolumeCm3: 4000, emptySpaceRatio: 40});
  });

  it("handles invalid zero volume safely", () => {
    expect(calculateEmptySpaceRatio(0, 20, 20, 10)).toEqual({packagingVolumeCm3: 0, emptySpaceRatio: 100});
  });
});

describe("PPWR input validation", () => {
  it("rejects incomplete packaging identity and geometry", () => {
    const errors = validateProfileInput({
      uniqueIdentifier: "x", name: "", intendedUse: "short", packagingWeightGrams: 0,
      lengthMm: -1, widthMm: 0, heightMm: Number.NaN, productVolumeCm3: -1,
    });
    expect(errors.length).toBeGreaterThanOrEqual(7);
  });
});

describe("PPWR conformity workflow", () => {
  it("marks a fully evidenced non-plastic dossier ready for declaration", () => {
    const result = evaluatePpwr(completeProfile, operator);
    expect(result.canDeclare).toBe(true);
    expect(result.completenessPercent).toBe(100);
    expect(result.checks.find((check) => check.code === "DECLARATION")?.status).toBe("WARNING");
  });

  it("blocks declaration when evidence and mass balance are incomplete", () => {
    const result = evaluatePpwr({
      ...completeProfile,
      packagingWeightGrams: 140,
      substancesStatus: "PENDING",
      evidence: completeProfile.evidence.filter((item) => item.evidenceType !== "SUBSTANCES_TEST"),
    }, operator);
    expect(result.canDeclare).toBe(false);
    expect(result.checks.find((check) => check.code === "MASS_BALANCE")?.status).toBe("FAIL");
    expect(result.checks.find((check) => check.code === "SUBSTANCES")?.status).toBe("FAIL");
  });

  it("requires recycled-content evidence for plastic components", () => {
    const result = evaluatePpwr({
      ...completeProfile,
      components: [{...completeProfile.components[0], materialCode: "PP 5", materialName: "Plastica PP"}],
    }, operator);
    expect(result.canDeclare).toBe(false);
    expect(result.checks.find((check) => check.code === "RECYCLED_CONTENT")?.status).toBe("FAIL");
  });

  it("accepts a signed declaration only after all checks pass", () => {
    const result = evaluatePpwr({
      ...completeProfile,
      status: "DECLARED",
      declarationNumber: "EU-2026-001",
      declarationPlace: "Milano",
      signatoryName: "Mario Rossi",
      signatoryRole: "Legale rappresentante",
      declaredAt: new Date("2026-07-14"),
    }, operator);
    expect(result.checks.find((check) => check.code === "DECLARATION")?.status).toBe("PASS");
  });
});
