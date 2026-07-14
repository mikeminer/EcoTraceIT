import {describe, expect, it} from "vitest";
import {enumValue, isSha256, normalizeCode, parseMeasuredValues, validateDocumentLink, validateLaboratory, validateSupplier} from "./supply-chain.server";

describe("supply-chain validation", () => {
  it("normalizes internal codes and validates professional records", () => {
    expect(normalizeCode(" sup 001 ")).toBe("SUP-001");
    expect(validateSupplier({supplierCode: "SUP-001", legalName: "Cartiera S.p.A.", countryCode: "IT", contactEmail: "qa@example.com", website: "https://example.com"})).toEqual([]);
    expect(validateLaboratory({laboratoryCode: "LAB-001", legalName: "Lab S.r.l.", countryCode: "IT", accreditationBody: "Accredia", accreditationNumber: "0123L", accreditationScope: "Prove chimiche sugli imballaggi"})).toEqual([]);
  });

  it("requires verifiable document links", () => {
    expect(isSha256("a".repeat(64))).toBe(true);
    expect(validateDocumentLink("http://example.com/report.pdf", "bad")).toHaveLength(2);
  });

  it("accepts only JSON objects for measured values", () => {
    expect(parseMeasuredValues('{"lead_mg_kg":12}')).toEqual({lead_mg_kg: 12});
    expect(() => parseMeasuredValues("[1,2]")).toThrow();
  });

  it("rejects values outside controlled vocabularies", () => {
    expect(enumValue("PASS", ["PASS", "FAIL"] as const)).toBe("PASS");
    expect(() => enumValue("UNKNOWN", ["PASS", "FAIL"] as const)).toThrow();
  });
});
