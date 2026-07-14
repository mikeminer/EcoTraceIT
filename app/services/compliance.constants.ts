export const PPWR_VERSION = "EU-2025-40/2026-07";
export const DECLARATION_STATEMENT_VERSION = "ECOTRACEIT-PPWR-ATTESTATION-1";
export const DECLARATION_ATTESTATION_TEXT = "Dichiaro, sotto la responsabilità del fabbricante indicato, che il fascicolo, i dati della catena di fornitura e le evidenze allegate sono accurati e che sono state soddisfatte le prescrizioni applicabili.";

export const EVIDENCE_TYPES = [
  "TECHNICAL_DRAWING",
  "SUPPLIER_DECLARATION",
  "SUBSTANCES_TEST",
  "RECYCLABILITY_ASSESSMENT",
  "RECYCLED_CONTENT_CERTIFICATE",
  "COMPOSTABILITY_CERTIFICATE",
  "FOOD_CONTACT_DECLARATION",
  "TEST_REPORT",
  "LABEL_ARTWORK",
] as const;

export const SUPPLIER_STATUSES = ["PENDING", "APPROVED", "SUSPENDED"] as const;
export const LABORATORY_STATUSES = ["PENDING", "APPROVED", "SUSPENDED"] as const;
export const DOCUMENT_STATUSES = ["DRAFT", "VERIFIED", "REJECTED"] as const;
export const TEST_RESULT_STATUSES = ["PASS", "FAIL", "INCONCLUSIVE"] as const;
export const CONAI_MATERIAL_FAMILIES = ["ACCIAIO", "ALLUMINIO", "CARTA", "LEGNO", "PLASTICA", "BIOPLASTICA", "VETRO", "COMPOSITO", "ALTRO"] as const;
export const PACKAGING_TYPES = ["PRIMARY", "SECONDARY", "TERTIARY", "SECONDARY_TERTIARY"] as const;
