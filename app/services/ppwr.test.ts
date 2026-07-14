import {describe, expect, it} from "vitest";
import {
  buildDeclarationPayload,
  calculateEmptySpaceRatio,
  DECLARATION_ATTESTATION_TEXT,
  DECLARATION_STATEMENT_VERSION,
  evaluatePpwr,
  hashCanonicalPayload,
  validateProfileInput,
  type ProfileData,
} from "./ppwr.server";

const operator = {
  economicRole: "MANUFACTURER",
  legalName: "Eco Merchant S.r.l.",
  streetAddress: "Via Roma 1",
  postalCode: "20100",
  city: "Milano",
  countryCode: "IT",
  contactEmail: "compliance@example.com",
};

const manufacturer = {
  id: "manufacturer-1",
  manufacturerLegalName: "Eco Merchant S.r.l.",
  vatNumber: "IT01234567890",
  streetAddress: "Via Roma 1",
  postalCode: "20100",
  city: "Milano",
  countryCode: "IT",
  responsibleName: "Mario Rossi",
  responsibleRole: "Legale rappresentante",
  responsibleEmail: "compliance@example.com",
  authorityBasis: "Legale rappresentante risultante dalla visura camerale",
  identityVerificationMethod: "SHOPIFY_ADMIN_ATTESTATION",
};

const evidence = (evidenceType: string) => ({evidenceType, title: evidenceType, reference: `REF-${evidenceType}`});
const hash = "a".repeat(64);

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
    id: "component-1",
    materialCode: "PAP 20", materialName: "Cartone ondulato", function: "Corpo scatola", weightGrams: 100,
    recycledContentPercent: 85, postConsumerPercent: 80, recyclingStream: "Carta", supplierDeclarationRef: "SUP-1",
    supplierId: "supplier-1",
    supplier: {id: "supplier-1", supplierCode: "SUP-001", legalName: "Cartiera S.p.A.", status: "APPROVED", countryCode: "IT"},
    conaiClassification: {
      materialFamily: "CARTA", conaiMaterialCode: "PAP 20", contributionBand: "1", packagingType: "SECONDARY_TERTIARY",
      contributionEurPerTonne: 65, validFrom: new Date("2026-01-01"), sourceReference: "CONAI-CAC-2026", sourceUrl: "https://example.com/conai.pdf", classificationStatus: "VERIFIED",
    },
  }],
  supplierDeclarations: [{
    supplierId: "supplier-1", componentId: "component-1", declarationType: "MATERIAL_COMPOSITION", title: "Dichiarazione composizione",
    reference: "SUP-1", status: "VERIFIED", issuedAt: new Date("2026-01-10"), sourceUrl: "https://example.com/supplier.pdf", sha256: hash,
  }],
  laboratoryTests: [{
    componentId: "component-1", testType: "SUBSTANCES", reportNumber: "LAB-001", title: "Metalli pesanti",
    standardReference: "EN 13432", method: "Spettrometria secondo metodo accreditato", sampleReference: "SAMPLE-BOX-001",
    resultStatus: "PASS", resultSummary: "Tutti i valori misurati sono inferiori ai limiti applicabili.", issuedAt: new Date("2026-02-01"),
    sourceUrl: "https://example.com/lab.pdf", sha256: hash, verificationStatus: "VERIFIED",
    laboratory: {legalName: "Laboratorio Accreditato S.r.l.", status: "APPROVED", accreditationBody: "Accredia", accreditationNumber: "0123L", accreditationScope: "Prove chimiche su materiali di imballaggio"},
  }],
  evidence: [
    evidence("TECHNICAL_DRAWING"), evidence("SUBSTANCES_TEST"), evidence("RECYCLABILITY_ASSESSMENT"), evidence("TEST_REPORT"), evidence("LABEL_ARTWORK"),
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
  it("marks a fully evidenced dossier ready for declaration", () => {
    const result = evaluatePpwr(completeProfile, operator, manufacturer);
    expect(result.canDeclare).toBe(true);
    expect(result.completenessPercent).toBe(100);
    expect(result.checks.find((check) => check.code === "DECLARATION")?.status).toBe("WARNING");
  });

  it("blocks declaration when evidence and mass balance are incomplete", () => {
    const result = evaluatePpwr({...completeProfile, packagingWeightGrams: 140, substancesStatus: "PENDING", evidence: completeProfile.evidence.filter((item) => item.evidenceType !== "SUBSTANCES_TEST")}, operator, manufacturer);
    expect(result.canDeclare).toBe(false);
    expect(result.checks.find((check) => check.code === "MASS_BALANCE")?.status).toBe("FAIL");
    expect(result.checks.find((check) => check.code === "SUBSTANCES")?.status).toBe("FAIL");
  });

  it("requires verified supplier declarations and CONAI classifications", () => {
    const result = evaluatePpwr({...completeProfile, supplierDeclarations: [], components: completeProfile.components.map((component) => ({...component, conaiClassification: null}))}, operator, manufacturer);
    expect(result.canDeclare).toBe(false);
    expect(result.checks.find((check) => check.code === "SUPPLIER_DECLARATIONS")?.status).toBe("FAIL");
    expect(result.checks.find((check) => check.code === "CONAI_CLASSIFICATION")?.status).toBe("FAIL");
  });

  it("requires recycled-content evidence for plastic components", () => {
    const result = evaluatePpwr({...completeProfile, components: [{...completeProfile.components[0], materialCode: "PP 5", materialName: "Plastica PP"}]}, operator, manufacturer);
    expect(result.canDeclare).toBe(false);
    expect(result.checks.find((check) => check.code === "RECYCLED_CONTENT")?.status).toBe("FAIL");
  });

  it("accepts an intact electronic attestation bound to the dossier hash", () => {
    const declaredBase: ProfileData = {...completeProfile, status: "DECLARED", declarationNumber: "EU-2026-001", declarationPlace: "Milano", signatoryName: manufacturer.responsibleName, signatoryRole: manufacturer.responsibleRole, declaredAt: new Date("2026-07-14")};
    const payload = buildDeclarationPayload(declaredBase, operator, manufacturer);
    const signed: ProfileData = {...declaredBase, declarationSignature: {
      declarationNumber: "EU-2026-001", signerName: manufacturer.responsibleName, signerRole: manufacturer.responsibleRole,
      signerEmail: manufacturer.responsibleEmail, signatureMethod: "ELECTRONIC_ATTESTATION", typedSignature: manufacturer.responsibleName,
      attestationText: DECLARATION_ATTESTATION_TEXT, statementVersion: DECLARATION_STATEMENT_VERSION, payload,
      payloadSha256: hashCanonicalPayload(payload), signedAt: new Date("2026-07-14"),
    }};
    const result = evaluatePpwr(signed, operator, manufacturer);
    expect(result.signatureIntegrity).toBe(true);
    expect(result.checks.find((check) => check.code === "DECLARATION")?.status).toBe("PASS");
  });

  it("detects a tampered signed snapshot", () => {
    const declaredBase: ProfileData = {...completeProfile, status: "DECLARED", declarationNumber: "EU-2026-002", declarationPlace: "Milano", signatoryName: manufacturer.responsibleName, signatoryRole: manufacturer.responsibleRole, declaredAt: new Date("2026-07-14")};
    const payload = buildDeclarationPayload(declaredBase, operator, manufacturer);
    const result = evaluatePpwr({...declaredBase, declarationSignature: {
      declarationNumber: "EU-2026-002", signerName: manufacturer.responsibleName, signerRole: manufacturer.responsibleRole,
      signerEmail: manufacturer.responsibleEmail, signatureMethod: "ELECTRONIC_ATTESTATION", typedSignature: manufacturer.responsibleName,
      attestationText: DECLARATION_ATTESTATION_TEXT, statementVersion: DECLARATION_STATEMENT_VERSION, payload: {...payload, declarationPlace: "Roma"},
      payloadSha256: hashCanonicalPayload(payload), signedAt: new Date("2026-07-14"),
    }}, operator, manufacturer);
    expect(result.signatureIntegrity).toBe(false);
  });
});
