export const PPWR_VERSION = "EU-2025-40/2026-07";

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

export interface OperatorData {
  economicRole?: string;
  legalName?: string;
  streetAddress?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  contactEmail?: string;
}

export interface ComponentData {
  materialCode: string;
  materialName: string;
  function: string;
  weightGrams: number;
  recycledContentPercent: number;
  postConsumerPercent: number;
  recyclingStream: string;
  supplierDeclarationRef?: string | null;
}

export interface EvidenceData {
  evidenceType: string;
  title: string;
  reference: string;
  issuer?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  sourceUrl?: string | null;
  sha256?: string | null;
}

export interface ProfileData {
  id?: string;
  uniqueIdentifier: string;
  version: number;
  name: string;
  intendedUse: string;
  packagingLevel: string;
  status: string;
  isReusable: boolean;
  reuseCycles?: number | null;
  foodContact: boolean;
  packagingWeightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  productVolumeCm3: number;
  emptySpaceRatio: number;
  substancesStatus: string;
  recyclabilityStatus: string;
  recyclabilityGrade?: string | null;
  recycledContentStatus: string;
  compostabilityStatus: string;
  labelStatus: string;
  minimisationAssessment: string;
  riskAssessment: string;
  manufacturingControls: string;
  harmonisedStandards?: string | null;
  commonSpecifications?: string | null;
  otherTechnicalSpecifications?: string | null;
  applicableLegislation?: string | null;
  declarationNumber?: string | null;
  declarationPlace?: string | null;
  signatoryName?: string | null;
  signatoryRole?: string | null;
  declaredAt?: Date | null;
  retentionUntil?: Date | null;
  components: ComponentData[];
  evidence: EvidenceData[];
}

export interface PpwrCheck {
  code: string;
  article: string;
  status: "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE";
  message: string;
}

const present = (value?: string | null, minimum = 1) => Boolean(value && value.trim().length >= minimum);
const hasEvidence = (evidence: EvidenceData[], type: string) => evidence.some((item) =>
  item.evidenceType === type && present(item.title) && present(item.reference) && (!item.expiresAt || item.expiresAt > new Date()),
);
const isPlastic = (component: ComponentData) => /PET|PE|PP|PS|PVC|PLASTIC|PLASTICA/i.test(`${component.materialCode} ${component.materialName}`);

export function calculateEmptySpaceRatio(lengthMm: number, widthMm: number, heightMm: number, productVolumeCm3: number) {
  const packagingVolumeCm3 = Math.max(0, lengthMm) * Math.max(0, widthMm) * Math.max(0, heightMm) / 1000;
  if (!packagingVolumeCm3) return {packagingVolumeCm3: 0, emptySpaceRatio: 100};
  const emptyVolume = Math.max(0, packagingVolumeCm3 - Math.max(0, productVolumeCm3));
  return {
    packagingVolumeCm3: Math.round(packagingVolumeCm3 * 100) / 100,
    emptySpaceRatio: Math.round(Math.min(100, emptyVolume / packagingVolumeCm3 * 100) * 100) / 100,
  };
}

export function validateProfileInput(profile: Pick<ProfileData,
  "uniqueIdentifier" | "name" | "intendedUse" | "packagingWeightGrams" | "lengthMm" | "widthMm" | "heightMm" | "productVolumeCm3"
>) {
  const errors: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{2,63}$/i.test(profile.uniqueIdentifier)) errors.push("Identificativo univoco non valido");
  if (!present(profile.name, 3)) errors.push("Nome imballaggio obbligatorio");
  if (!present(profile.intendedUse, 10)) errors.push("Descrivere l'uso previsto");
  for (const [label, value] of Object.entries({peso: profile.packagingWeightGrams, lunghezza: profile.lengthMm, larghezza: profile.widthMm, altezza: profile.heightMm})) {
    if (!Number.isFinite(value) || value <= 0) errors.push(`${label} deve essere maggiore di zero`);
  }
  if (!Number.isFinite(profile.productVolumeCm3) || profile.productVolumeCm3 < 0) errors.push("Volume prodotto non valido");
  return errors;
}

export function evaluatePpwr(profile: ProfileData, operator?: OperatorData | null) {
  const checks: PpwrCheck[] = [];
  const add = (code: string, article: string, pass: boolean, ok: string, fail: string, status?: PpwrCheck["status"]) =>
    checks.push({code, article, status: status || (pass ? "PASS" : "FAIL"), message: pass ? ok : fail});

  const operatorComplete = Boolean(operator && present(operator.legalName) && present(operator.streetAddress) && present(operator.postalCode)
    && present(operator.city) && present(operator.countryCode, 2) && present(operator.contactEmail));
  add("OPERATOR", "Art. 15 e Allegato VIII", operatorComplete, "Operatore economico identificato", "Completare identità e contatti dell'operatore responsabile");
  add("TRACEABILITY", "Art. 15(5)", present(profile.uniqueIdentifier, 3) && profile.version > 0,
    "Tipo di imballaggio identificabile e versionato", "Identificativo o versione mancanti");
  add("COMPONENTS", "Allegato VII, punto 2(b)", profile.components.length > 0,
    "Componenti e materiali documentati", "Inserire almeno un componente con materiale e funzione");

  const componentMass = profile.components.reduce((sum, component) => sum + component.weightGrams, 0);
  const tolerance = Math.max(1, profile.packagingWeightGrams * 0.02);
  add("MASS_BALANCE", "Art. 10 e Allegato IV", profile.components.length > 0 && Math.abs(componentMass - profile.packagingWeightGrams) <= tolerance,
    "Somma dei componenti coerente con il peso totale", `Riconciliare peso totale (${profile.packagingWeightGrams} g) e componenti (${componentMass.toFixed(2)} g), tolleranza ${tolerance.toFixed(2)} g`);

  add("SUBSTANCES", "Art. 5", profile.substancesStatus === "VERIFIED" && hasEvidence(profile.evidence, "SUBSTANCES_TEST"),
    "Sostanze soggette a restrizione verificate con evidenza valida", "Allegare prova sulle sostanze e impostare lo stato su verificato");
  add("RECYCLABILITY", "Art. 6", profile.recyclabilityStatus === "VERIFIED" && hasEvidence(profile.evidence, "RECYCLABILITY_ASSESSMENT"),
    "Valutazione di riciclabilità documentata", "Serve una valutazione di riciclabilità verificata");

  const containsPlastic = profile.components.some(isPlastic);
  if (containsPlastic) {
    add("RECYCLED_CONTENT", "Art. 7", profile.recycledContentStatus === "VERIFIED" && hasEvidence(profile.evidence, "RECYCLED_CONTENT_CERTIFICATE"),
      "Contenuto riciclato della plastica verificato", "Per componenti in plastica servono percentuali e certificato di contenuto riciclato");
  } else {
    add("RECYCLED_CONTENT", "Art. 7", true, "Nessun componente plastico dichiarato", "", "NOT_APPLICABLE");
  }

  if (profile.compostabilityStatus === "CLAIMED") {
    add("COMPOSTABILITY", "Art. 9", hasEvidence(profile.evidence, "COMPOSTABILITY_CERTIFICATE"),
      "Compostabilità supportata da certificato", "Il claim di compostabilità richiede un certificato");
  } else {
    add("COMPOSTABILITY", "Art. 9", true, "Nessun claim di compostabilità", "", "NOT_APPLICABLE");
  }

  if (profile.foodContact) {
    add("FOOD_CONTACT", "Art. 5 e normativa MOCA applicabile", hasEvidence(profile.evidence, "FOOD_CONTACT_DECLARATION") && present(profile.applicableLegislation),
      "Idoneità al contatto alimentare documentata", "Per il contatto alimentare servono dichiarazione MOCA e normativa applicabile");
  } else {
    add("FOOD_CONTACT", "Art. 5 e normativa MOCA applicabile", true, "Nessun contatto alimentare dichiarato", "", "NOT_APPLICABLE");
  }
  const geometry = calculateEmptySpaceRatio(profile.lengthMm, profile.widthMm, profile.heightMm, profile.productVolumeCm3);
  const ratioMatches = Math.abs(geometry.emptySpaceRatio - profile.emptySpaceRatio) <= 0.1;
  const ratioReady = !["ECOMMERCE", "GROUPED", "TRANSPORT"].includes(profile.packagingLevel) || geometry.emptySpaceRatio <= 50;
  add("MINIMISATION", "Art. 10, Art. 24 e Allegato IV", present(profile.minimisationAssessment, 40) && ratioMatches && ratioReady,
    "Minimizzazione e spazio vuoto documentati", `Documentare la minimizzazione e mantenere lo spazio vuoto entro il 50%; valore calcolato ${geometry.emptySpaceRatio}%`);

  if (profile.isReusable) {
    add("REUSE", "Art. 11", Boolean(profile.reuseCycles && profile.reuseCycles > 0),
      "Numero di rotazioni documentato", "Indicare il numero verificato di rotazioni dell'imballaggio riutilizzabile");
  } else {
    add("REUSE", "Art. 11", true, "Imballaggio dichiarato monouso", "", "NOT_APPLICABLE");
  }

  add("LABEL", "Art. 12", profile.labelStatus === "VERIFIED" && hasEvidence(profile.evidence, "LABEL_ARTWORK"),
    "Etichetta e composizione documentate", "Allegare l'artwork dell'etichetta e verificarlo rispetto alle regole applicabili");
  const specificationsPresent = present(profile.harmonisedStandards) || present(profile.commonSpecifications) || present(profile.otherTechnicalSpecifications);
  add("TECHNICAL_FILE", "Allegato VII", present(profile.riskAssessment, 40) && present(profile.manufacturingControls, 40)
    && specificationsPresent && hasEvidence(profile.evidence, "TECHNICAL_DRAWING") && hasEvidence(profile.evidence, "TEST_REPORT"),
  "Fascicolo tecnico corredato da disegno, prove, rischi, controlli e specifiche", "Completare analisi rischi, controlli, specifiche, disegno tecnico e rapporto di prova");

  const blocking = checks.filter((check) => check.status === "FAIL");
  const applicable = checks.filter((check) => check.status !== "NOT_APPLICABLE");
  const passed = applicable.filter((check) => check.status === "PASS").length;
  const canDeclare = blocking.length === 0;
  const declarationComplete = Boolean(profile.declarationNumber && profile.declarationPlace && profile.signatoryName && profile.signatoryRole && profile.declaredAt);
  checks.push({
    code: "DECLARATION",
    article: "Art. 39 e Allegato VIII",
    status: profile.status === "DECLARED" && declarationComplete && canDeclare ? "PASS" : canDeclare ? "WARNING" : "FAIL",
    message: profile.status === "DECLARED" && declarationComplete && canDeclare
      ? "Dichiarazione UE registrata sotto la responsabilità del firmatario"
      : canDeclare ? "Il fascicolo è pronto per la dichiarazione del responsabile" : "La dichiarazione è bloccata finché restano verifiche fallite",
  });

  return {
    checks,
    canDeclare,
    completenessPercent: Math.round(passed / Math.max(1, applicable.length) * 100),
    componentMass: Math.round(componentMass * 100) / 100,
    packagingVolumeCm3: geometry.packagingVolumeCm3,
    calculatedEmptySpaceRatio: geometry.emptySpaceRatio,
    ppwrVersion: PPWR_VERSION,
  };
}

export function buildTechnicalDossier(profile: ProfileData, operator: OperatorData, evaluation = evaluatePpwr(profile, operator)) {
  return {
    schema: "https://ecotraceit.com/schemas/ppwr-dossier-v1.json",
    generatedAt: new Date().toISOString(),
    regulation: "Regulation (EU) 2025/40",
    legalNotice: "Documento di supporto. La dichiarazione di conformità resta responsabilità esclusiva del fabbricante ai sensi dell'articolo 39.",
    operator,
    packaging: profile,
    assessment: evaluation,
    retention: profile.isReusable ? "10 years" : "5 years",
  };
}
