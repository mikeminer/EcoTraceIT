export {
  CONAI_MATERIAL_FAMILIES,
  DOCUMENT_STATUSES,
  LABORATORY_STATUSES,
  PACKAGING_TYPES,
  SUPPLIER_STATUSES,
  TEST_RESULT_STATUSES,
} from "./compliance.constants";

export type SupplierInput = {
  supplierCode: string;
  legalName: string;
  countryCode: string;
  contactEmail?: string | null;
  website?: string | null;
};

export type LaboratoryInput = {
  laboratoryCode: string;
  legalName: string;
  countryCode: string;
  accreditationBody: string;
  accreditationNumber: string;
  accreditationScope: string;
  contactEmail?: string | null;
  website?: string | null;
};

export const isHttpsUrl = (value?: string | null) => Boolean(value && /^https:\/\/[^\s]+$/i.test(value));
export const isSha256 = (value?: string | null) => Boolean(value && /^[a-f0-9]{64}$/i.test(value));
export const isEmail = (value?: string | null) => !value || /^\S+@\S+\.\S+$/.test(value);
export const normalizeCode = (value: string, max = 64) => value.trim().toUpperCase().replace(/\s+/g, "-").slice(0, max);

export function validateSupplier(input: SupplierInput) {
  const errors: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(input.supplierCode)) errors.push("Codice fornitore non valido");
  if (input.legalName.trim().length < 2) errors.push("Ragione sociale fornitore obbligatoria");
  if (!/^[A-Z]{2}$/.test(input.countryCode)) errors.push("Paese fornitore non valido");
  if (!isEmail(input.contactEmail)) errors.push("Email fornitore non valida");
  if (input.website && !isHttpsUrl(input.website)) errors.push("Il sito del fornitore deve usare HTTPS");
  return errors;
}

export function validateLaboratory(input: LaboratoryInput) {
  const errors: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(input.laboratoryCode)) errors.push("Codice laboratorio non valido");
  if (input.legalName.trim().length < 2) errors.push("Ragione sociale laboratorio obbligatoria");
  if (!/^[A-Z]{2}$/.test(input.countryCode)) errors.push("Paese laboratorio non valido");
  if (input.accreditationBody.trim().length < 2 || input.accreditationNumber.trim().length < 2 || input.accreditationScope.trim().length < 10) {
    errors.push("Indicare ente, numero e campo di accreditamento");
  }
  if (!isEmail(input.contactEmail)) errors.push("Email laboratorio non valida");
  if (input.website && !isHttpsUrl(input.website)) errors.push("Il sito del laboratorio deve usare HTTPS");
  return errors;
}

export function validateDocumentLink(sourceUrl: string, sha256: string) {
  const errors: string[] = [];
  if (!isHttpsUrl(sourceUrl)) errors.push("URL documento HTTPS obbligatorio");
  if (!isSha256(sha256)) errors.push("SHA-256 obbligatorio (64 caratteri esadecimali)");
  return errors;
}

export function parseMeasuredValues(value: string) {
  if (!value.trim()) return null;
  if (value.length > 20_000) throw new Error("I valori misurati superano il limite consentito.");
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("I valori misurati devono essere un oggetto JSON.");
  return parsed as Record<string, unknown>;
}

export function enumValue<T extends readonly string[]>(value: string, allowed: T, fallback?: T[number]) {
  if ((allowed as readonly string[]).includes(value)) return value as T[number];
  if (fallback) return fallback;
  throw new Error(`Valore non consentito: ${value}`);
}
