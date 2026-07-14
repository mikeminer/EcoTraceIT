import {createHash} from "node:crypto";
import {
  DECLARATION_ATTESTATION_TEXT,
  DECLARATION_STATEMENT_VERSION,
  PPWR_VERSION,
} from "./compliance.constants";

export {DECLARATION_ATTESTATION_TEXT, DECLARATION_STATEMENT_VERSION, EVIDENCE_TYPES, PPWR_VERSION} from "./compliance.constants";

export interface OperatorData {
  economicRole?: string;
  legalName?: string;
  streetAddress?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  contactEmail?: string;
}

export interface SupplierData {
  id?: string;
  supplierCode?: string;
  legalName?: string;
  status?: string;
  countryCode?: string;
  vatNumber?: string | null;
}

export interface ConaiClassificationData {
  materialFamily: string;
  conaiMaterialCode: string;
  contributionBand?: string | null;
  environmentalClass?: string | null;
  packagingType: string;
  contributionEurPerTonne?: number | null;
  validFrom: Date;
  validTo?: Date | null;
  sourceReference: string;
  sourceUrl?: string | null;
  classificationStatus: string;
}

export interface ComponentData {
  id?: string;
  materialCode: string;
  materialName: string;
  function: string;
  weightGrams: number;
  recycledContentPercent: number;
  postConsumerPercent: number;
  recyclingStream: string;
  supplierId?: string | null;
  supplierDeclarationRef?: string | null;
  supplier?: SupplierData | null;
  conaiClassification?: ConaiClassificationData | null;
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

export interface SupplierDeclarationData {
  supplierId: string;
  componentId?: string | null;
  declarationType: string;
  title: string;
  reference: string;
  status: string;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  sourceUrl?: string | null;
  sha256?: string | null;
}

export interface LaboratoryData {
  legalName: string;
  status: string;
  accreditationBody: string;
  accreditationNumber: string;
  accreditationScope: string;
}

export interface LaboratoryTestData {
  componentId?: string | null;
  testType: string;
  reportNumber: string;
  title: string;
  standardReference: string;
  method: string;
  sampleReference: string;
  resultStatus: string;
  resultSummary: string;
  issuedAt: Date;
  expiresAt?: Date | null;
  sourceUrl: string;
  sha256: string;
  verificationStatus: string;
  laboratory: LaboratoryData;
}

export interface ManufacturerData {
  id?: string;
  manufacturerLegalName?: string;
  vatNumber?: string | null;
  eoriNumber?: string | null;
  streetAddress?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  responsibleName?: string;
  responsibleRole?: string;
  responsibleEmail?: string;
  authorityBasis?: string;
  identityVerificationMethod?: string;
}

export interface DeclarationSignatureData {
  declarationNumber: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
  signatureMethod: string;
  typedSignature: string;
  attestationText: string;
  statementVersion: string;
  payload: unknown;
  payloadSha256: string;
  signedAt: Date;
  revokedAt?: Date | null;
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
  supplierDeclarations?: SupplierDeclarationData[];
  laboratoryTests?: LaboratoryTestData[];
  declarationSignature?: DeclarationSignatureData | null;
}

export interface PpwrCheck {
  code: string;
  article: string;
  status: "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE";
  message: string;
}

const present = (value?: string | null, minimum = 1) => Boolean(value && value.trim().length >= minimum);
const isHttps = (value?: string | null) => Boolean(value && /^https:\/\//i.test(value));
const isSha256 = (value?: string | null) => Boolean(value && /^[a-f0-9]{64}$/i.test(value));
const validAt = (expiresAt?: Date | null, now = new Date()) => !expiresAt || expiresAt >= now;
const hasEvidence = (evidence: EvidenceData[], type: string) => evidence.some((item) =>
  item.evidenceType === type && present(item.title) && present(item.reference) && validAt(item.expiresAt),
);
const isPlastic = (component: ComponentData) => /PET|PE|PP|PS|PVC|PLASTIC|PLASTICA/i.test(`${component.materialCode} ${component.materialName}`);
const dateValue = (value?: Date | null) => value ? new Date(value).toISOString() : null;
const byReference = <T extends {reference?: string; reportNumber?: string; materialCode?: string}>(a: T, b: T) =>
  String(a.reference || a.reportNumber || a.materialCode || "").localeCompare(String(b.reference || b.reportNumber || b.materialCode || ""));

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

export function buildDeclarationPayload(profile: ProfileData, operator: OperatorData, manufacturer: ManufacturerData) {
  return {
    schema: "https://ecotraceit.com/schemas/ppwr-declaration-signature-v1.json",
    statementVersion: DECLARATION_STATEMENT_VERSION,
    regulation: PPWR_VERSION,
    declarationNumber: profile.declarationNumber || "",
    declarationPlace: profile.declarationPlace || "",
    operator: {
      economicRole: operator.economicRole || "",
      legalName: operator.legalName || "",
      streetAddress: operator.streetAddress || "",
      postalCode: operator.postalCode || "",
      city: operator.city || "",
      countryCode: operator.countryCode || "",
      contactEmail: operator.contactEmail || "",
    },
    manufacturer: {
      manufacturerLegalName: manufacturer.manufacturerLegalName || "",
      vatNumber: manufacturer.vatNumber || null,
      eoriNumber: manufacturer.eoriNumber || null,
      streetAddress: manufacturer.streetAddress || "",
      postalCode: manufacturer.postalCode || "",
      city: manufacturer.city || "",
      countryCode: manufacturer.countryCode || "",
      responsibleName: manufacturer.responsibleName || "",
      responsibleRole: manufacturer.responsibleRole || "",
      responsibleEmail: manufacturer.responsibleEmail || "",
      authorityBasis: manufacturer.authorityBasis || "",
    },
    packaging: {
      uniqueIdentifier: profile.uniqueIdentifier,
      version: profile.version,
      name: profile.name,
      intendedUse: profile.intendedUse,
      packagingLevel: profile.packagingLevel,
      isReusable: profile.isReusable,
      reuseCycles: profile.reuseCycles || null,
      foodContact: profile.foodContact,
      packagingWeightGrams: profile.packagingWeightGrams,
      dimensionsMm: [profile.lengthMm, profile.widthMm, profile.heightMm],
      productVolumeCm3: profile.productVolumeCm3,
      emptySpaceRatio: profile.emptySpaceRatio,
      assessments: {
        substancesStatus: profile.substancesStatus,
        recyclabilityStatus: profile.recyclabilityStatus,
        recyclabilityGrade: profile.recyclabilityGrade || null,
        recycledContentStatus: profile.recycledContentStatus,
        compostabilityStatus: profile.compostabilityStatus,
        labelStatus: profile.labelStatus,
        minimisationAssessment: profile.minimisationAssessment,
        riskAssessment: profile.riskAssessment,
        manufacturingControls: profile.manufacturingControls,
      },
      specifications: {
        harmonisedStandards: profile.harmonisedStandards || null,
        commonSpecifications: profile.commonSpecifications || null,
        otherTechnicalSpecifications: profile.otherTechnicalSpecifications || null,
        applicableLegislation: profile.applicableLegislation || null,
      },
    },
    components: [...profile.components].sort(byReference).map((component) => ({
      id: component.id || null,
      materialCode: component.materialCode,
      materialName: component.materialName,
      function: component.function,
      weightGrams: component.weightGrams,
      recycledContentPercent: component.recycledContentPercent,
      postConsumerPercent: component.postConsumerPercent,
      recyclingStream: component.recyclingStream,
      supplierId: component.supplierId || null,
      supplier: component.supplier ? {
        supplierCode: component.supplier.supplierCode || "",
        legalName: component.supplier.legalName || "",
        countryCode: component.supplier.countryCode || "",
        vatNumber: component.supplier.vatNumber || null,
        status: component.supplier.status || "",
      } : null,
      conaiClassification: component.conaiClassification ? {
        materialFamily: component.conaiClassification.materialFamily,
        conaiMaterialCode: component.conaiClassification.conaiMaterialCode,
        contributionBand: component.conaiClassification.contributionBand || null,
        environmentalClass: component.conaiClassification.environmentalClass || null,
        packagingType: component.conaiClassification.packagingType,
        contributionEurPerTonne: component.conaiClassification.contributionEurPerTonne ?? null,
        validFrom: dateValue(component.conaiClassification.validFrom),
        validTo: dateValue(component.conaiClassification.validTo),
        sourceReference: component.conaiClassification.sourceReference,
        sourceUrl: component.conaiClassification.sourceUrl || null,
        classificationStatus: component.conaiClassification.classificationStatus,
      } : null,
    })),
    supplierDeclarations: [...(profile.supplierDeclarations || [])].sort(byReference).map((item) => ({
      supplierId: item.supplierId,
      componentId: item.componentId || null,
      declarationType: item.declarationType,
      reference: item.reference,
      status: item.status,
      issuedAt: dateValue(item.issuedAt),
      expiresAt: dateValue(item.expiresAt),
      sourceUrl: item.sourceUrl || null,
      sha256: item.sha256 || null,
    })),
    laboratoryTests: [...(profile.laboratoryTests || [])].sort(byReference).map((item) => ({
      componentId: item.componentId || null,
      testType: item.testType,
      reportNumber: item.reportNumber,
      standardReference: item.standardReference,
      method: item.method,
      sampleReference: item.sampleReference,
      resultStatus: item.resultStatus,
      resultSummary: item.resultSummary,
      issuedAt: dateValue(item.issuedAt),
      expiresAt: dateValue(item.expiresAt),
      sourceUrl: item.sourceUrl,
      sha256: item.sha256,
      verificationStatus: item.verificationStatus,
      laboratory: {
        legalName: item.laboratory.legalName,
        accreditationBody: item.laboratory.accreditationBody,
        accreditationNumber: item.laboratory.accreditationNumber,
      },
    })),
    evidence: [...profile.evidence].sort(byReference).map((item) => ({
      evidenceType: item.evidenceType,
      title: item.title,
      reference: item.reference,
      issuer: item.issuer || null,
      issuedAt: dateValue(item.issuedAt),
      expiresAt: dateValue(item.expiresAt),
      sourceUrl: item.sourceUrl || null,
      sha256: item.sha256 || null,
    })),
  };
}

export function hashDeclarationPayload(profile: ProfileData, operator: OperatorData, manufacturer: ManufacturerData) {
  return hashCanonicalPayload(buildDeclarationPayload(profile, operator, manufacturer));
}

export function hashCanonicalPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function evaluatePpwr(profile: ProfileData, operator?: OperatorData | null, manufacturer?: ManufacturerData | null) {
  const checks: PpwrCheck[] = [];
  const add = (code: string, article: string, pass: boolean, ok: string, fail: string, status?: PpwrCheck["status"]) =>
    checks.push({code, article, status: status || (pass ? "PASS" : "FAIL"), message: pass ? ok : fail});
  const now = new Date();
  const supplierDeclarations = profile.supplierDeclarations || [];
  const laboratoryTests = profile.laboratoryTests || [];

  const operatorComplete = Boolean(operator && present(operator.legalName) && present(operator.streetAddress) && present(operator.postalCode)
    && present(operator.city) && present(operator.countryCode, 2) && present(operator.contactEmail));
  add("OPERATOR", "Art. 15 e Allegato VIII", operatorComplete, "Operatore economico identificato", "Completare identità e contatti dell'operatore responsabile");
  const manufacturerComplete = Boolean(manufacturer && present(manufacturer.manufacturerLegalName) && present(manufacturer.streetAddress)
    && present(manufacturer.postalCode) && present(manufacturer.city) && present(manufacturer.countryCode, 2)
    && present(manufacturer.responsibleName) && present(manufacturer.responsibleRole) && present(manufacturer.responsibleEmail)
    && present(manufacturer.authorityBasis, 10));
  add("MANUFACTURER_RESPONSIBLE", "Art. 15, Art. 39 e Allegato VIII", manufacturerComplete,
    "Fabbricante e responsabile autorizzato identificati", "Registrare il fabbricante, il responsabile, il ruolo e la base dei poteri di firma");
  add("TRACEABILITY", "Art. 15(5)", present(profile.uniqueIdentifier, 3) && profile.version > 0,
    "Tipo di imballaggio identificabile e versionato", "Identificativo o versione mancanti");
  add("COMPONENTS", "Allegato VII, punto 2(b)", profile.components.length > 0,
    "Componenti e materiali documentati", "Inserire almeno un componente con materiale e funzione");

  const suppliersComplete = profile.components.length > 0 && profile.components.every((component) =>
    component.supplierId && component.supplier?.id === component.supplierId && component.supplier.status === "APPROVED"
    && present(component.supplier.supplierCode) && present(component.supplier.legalName));
  add("SUPPLIER_TRACEABILITY", "Art. 15 e Allegato VII", suppliersComplete,
    "Fornitori approvati collegati a tutti i componenti", "Collegare ogni componente a un fornitore strutturato e approvato");
  const supplierEvidenceComplete = profile.components.length > 0 && profile.components.every((component) => supplierDeclarations.some((item) =>
    item.supplierId === component.supplierId && (!item.componentId || item.componentId === component.id) && item.status === "VERIFIED"
    && present(item.title) && present(item.reference) && validAt(item.expiresAt, now) && isHttps(item.sourceUrl) && isSha256(item.sha256)));
  add("SUPPLIER_DECLARATIONS", "Art. 5, Art. 15 e Allegato VII", supplierEvidenceComplete,
    "Dichiarazioni fornitore verificabili per tutti i componenti", "Allegare per ogni componente una dichiarazione fornitore verificata, con URL HTTPS e SHA-256");

  const componentMass = profile.components.reduce((sum, component) => sum + component.weightGrams, 0);
  const tolerance = Math.max(1, profile.packagingWeightGrams * 0.02);
  add("MASS_BALANCE", "Art. 10 e Allegato IV", profile.components.length > 0 && Math.abs(componentMass - profile.packagingWeightGrams) <= tolerance,
    "Somma dei componenti coerente con il peso totale", `Riconciliare peso totale (${profile.packagingWeightGrams} g) e componenti (${componentMass.toFixed(2)} g), tolleranza ${tolerance.toFixed(2)} g`);

  const validLabTest = (test: LaboratoryTestData) => test.verificationStatus === "VERIFIED" && test.resultStatus === "PASS"
    && validAt(test.expiresAt, now) && present(test.reportNumber) && present(test.standardReference) && present(test.method)
    && present(test.sampleReference) && present(test.resultSummary, 10) && isHttps(test.sourceUrl) && isSha256(test.sha256)
    && test.laboratory.status === "APPROVED" && present(test.laboratory.accreditationBody)
    && present(test.laboratory.accreditationNumber) && present(test.laboratory.accreditationScope, 10);
  const verifiedLabTests = laboratoryTests.filter(validLabTest);
  add("LABORATORY_TESTS", "Allegato VII, punti 3 e 4", verifiedLabTests.length > 0,
    "Rapporti di prova strutturati, verificati e riferiti a laboratorio approvato", "Registrare almeno una prova valida con laboratorio accreditato, metodo, campione, esito, URL e SHA-256");
  const substanceLabEvidence = verifiedLabTests.some((test) => /SUBSTANCE|CHEMICAL|HEAVY_METAL|MIGRATION/i.test(test.testType));
  add("SUBSTANCES", "Art. 5", profile.substancesStatus === "VERIFIED" && hasEvidence(profile.evidence, "SUBSTANCES_TEST") && substanceLabEvidence,
    "Sostanze soggette a restrizione verificate con evidenza e prova di laboratorio", "Servono evidenza sulle sostanze e prova di laboratorio strutturata con esito positivo");
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

  const conaiReady = profile.components.length > 0 && profile.components.every((component) => {
    const classification = component.conaiClassification;
    return classification?.classificationStatus === "VERIFIED" && present(classification.materialFamily)
      && present(classification.conaiMaterialCode) && present(classification.packagingType)
      && present(classification.sourceReference) && new Date(classification.validFrom) <= now && validAt(classification.validTo, now)
      && (!classification.sourceUrl || isHttps(classification.sourceUrl));
  });
  add("CONAI_CLASSIFICATION", "EPR nazionale / classificazione CONAI", conaiReady,
    "Classificazione CONAI verificata e versionata per tutti i componenti", "Classificare ogni componente con famiglia, codice, tipologia, validità e fonte CONAI");

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
    && specificationsPresent && hasEvidence(profile.evidence, "TECHNICAL_DRAWING") && verifiedLabTests.length > 0,
  "Fascicolo tecnico corredato da disegno, prove strutturate, rischi, controlli e specifiche", "Completare analisi rischi, controlli, specifiche, disegno tecnico e rapporti di prova strutturati");

  const blocking = checks.filter((check) => check.status === "FAIL");
  const applicable = checks.filter((check) => check.status !== "NOT_APPLICABLE");
  const passed = applicable.filter((check) => check.status === "PASS").length;
  const canDeclare = blocking.length === 0;
  const signature = profile.declarationSignature;
  const signedPayload = signature?.payload as {declarationNumber?: unknown; packaging?: {uniqueIdentifier?: unknown; version?: unknown}} | undefined;
  const signatureIntegrity = Boolean(signature && !signature.revokedAt && isSha256(signature.payloadSha256)
    && signature.statementVersion === DECLARATION_STATEMENT_VERSION && signature.attestationText === DECLARATION_ATTESTATION_TEXT
    && signature.declarationNumber === profile.declarationNumber
    && signedPayload?.declarationNumber === profile.declarationNumber
    && signedPayload?.packaging?.uniqueIdentifier === profile.uniqueIdentifier && signedPayload?.packaging?.version === profile.version
    && signature.payloadSha256 === hashCanonicalPayload(signature.payload));
  const declarationComplete = Boolean(profile.declarationNumber && profile.declarationPlace && profile.signatoryName && profile.signatoryRole && profile.declaredAt && signatureIntegrity);
  checks.push({
    code: "DECLARATION",
    article: "Art. 39 e Allegato VIII",
    status: profile.status === "DECLARED" && declarationComplete && canDeclare ? "PASS" : canDeclare ? "WARNING" : "FAIL",
    message: profile.status === "DECLARED" && declarationComplete && canDeclare
      ? "Dichiarazione UE registrata con attestazione elettronica e hash del fascicolo verificato"
      : canDeclare ? "Il fascicolo è pronto per l'attestazione del responsabile del fabbricante" : "La dichiarazione è bloccata finché restano verifiche fallite",
  });

  return {
    checks,
    canDeclare,
    completenessPercent: Math.round(passed / Math.max(1, applicable.length) * 100),
    componentMass: Math.round(componentMass * 100) / 100,
    packagingVolumeCm3: geometry.packagingVolumeCm3,
    calculatedEmptySpaceRatio: geometry.emptySpaceRatio,
    ppwrVersion: PPWR_VERSION,
    signatureIntegrity,
  };
}

export function buildTechnicalDossier(profile: ProfileData, operator: OperatorData, manufacturer: ManufacturerData, evaluation = evaluatePpwr(profile, operator, manufacturer)) {
  return {
    schema: "https://ecotraceit.com/schemas/ppwr-dossier-v2.json",
    generatedAt: new Date().toISOString(),
    regulation: "Regulation (EU) 2025/40",
    legalNotice: "Documento di supporto. La dichiarazione di conformità resta responsabilità esclusiva del fabbricante ai sensi dell'articolo 39.",
    operator,
    manufacturer,
    packaging: profile,
    signedPayload: profile.declarationSignature?.payload || null,
    assessment: evaluation,
    retention: profile.isReusable ? "10 years" : "5 years",
  };
}
