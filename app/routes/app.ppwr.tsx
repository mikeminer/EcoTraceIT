import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import type {Prisma} from "@prisma/client";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";
import {
  buildDeclarationPayload,
  calculateEmptySpaceRatio,
  evaluatePpwr,
  hashCanonicalPayload,
  validateProfileInput,
} from "../services/ppwr.server";
import {
  enumValue,
  isHttpsUrl,
  isSha256,
  parseMeasuredValues,
  validateDocumentLink,
} from "../services/supply-chain.server";
import {
  CONAI_MATERIAL_FAMILIES,
  DECLARATION_ATTESTATION_TEXT,
  DECLARATION_STATEMENT_VERSION,
  PACKAGING_TYPES,
  TEST_RESULT_STATUSES,
} from "../services/compliance.constants";

const text = (form: FormData, key: string, max = 4000) => String(form.get(key) || "").trim().slice(0, max);
const number = (form: FormData, key: string) => Number(form.get(key));
const optionalNumber = (form: FormData, key: string) => text(form, key, 100) ? Number(form.get(key)) : null;
const checked = (form: FormData, key: string) => form.get(key) === "on";
const validPercent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
const actorFor = (session: {shop: string; id?: string | null}) => session.id ? `shopify-session:${session.id}` : session.shop;

function formDate(form: FormData, key: string, required = false) {
  const value = text(form, key, 10);
  if (!value) {
    if (required) throw new Error(`Data obbligatoria: ${key}`);
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Data non valida: ${key}`);
  return parsed;
}

const dossierInclude = {
  components: {include: {supplier: true, conaiClassification: true}},
  evidence: true,
  supplierDeclarations: {include: {supplier: true}},
  laboratoryTests: {include: {laboratory: true}},
  declarationSignature: true,
  checks: true,
} as const;

async function ownedProfile(shop: string, id: string) {
  return prisma.packagingProfile.findFirst({where: {id, shop}, include: dossierInclude});
}

async function saveChecks(profileId: string, checks: ReturnType<typeof evaluatePpwr>["checks"]) {
  await prisma.$transaction(checks.map((check) => prisma.complianceCheck.upsert({
    where: {profileId_code: {profileId, code: check.code}},
    create: {profileId, ...check},
    update: {article: check.article, status: check.status, message: check.message, checkedAt: new Date()},
  })));
}

async function invalidateDraft(profileId: string) {
  await prisma.packagingProfile.update({where: {id: profileId}, data: {
    status: "DRAFT",
    declarationNumber: null,
    declarationPlace: null,
    signatoryName: null,
    signatoryRole: null,
    declaredAt: null,
    retentionUntil: null,
  }});
}

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  const selectedId = new URL(request.url).searchParams.get("profile");
  const [operator, manufacturer, suppliers, laboratories, profiles, selected] = await Promise.all([
    prisma.complianceOperator.findUnique({where: {shop: session.shop}}),
    prisma.manufacturerResponsible.findUnique({where: {shop: session.shop}}),
    prisma.supplier.findMany({where: {shop: session.shop, status: "APPROVED"}, orderBy: {legalName: "asc"}}),
    prisma.testingLaboratory.findMany({where: {shop: session.shop, status: "APPROVED"}, orderBy: {legalName: "asc"}}),
    prisma.packagingProfile.findMany({
      where: {shop: session.shop},
      orderBy: {updatedAt: "desc"},
      include: {_count: {select: {components: true, evidence: true, supplierDeclarations: true, laboratoryTests: true}}, checks: true},
    }),
    selectedId ? prisma.packagingProfile.findFirst({
      where: {id: selectedId, shop: session.shop},
      include: {
        components: {include: {supplier: true, conaiClassification: true}},
        evidence: {orderBy: {createdAt: "desc"}},
        supplierDeclarations: {include: {supplier: true}, orderBy: {createdAt: "desc"}},
        laboratoryTests: {include: {laboratory: true}, orderBy: {createdAt: "desc"}},
        declarationSignature: true,
        checks: true,
        auditLogs: {orderBy: {createdAt: "desc"}, take: 30},
      },
    }) : null,
  ]);
  return {operator, manufacturer, suppliers, laboratories, profiles, selected, evaluation: selected ? evaluatePpwr(selected, operator, manufacturer) : null};
};

export const action = async ({request}: ActionFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const intent = text(form, "intent", 40);
  const actor = actorFor(session);

  try {
    if (intent === "saveOperator") {
      const data = {
        economicRole: text(form, "economicRole", 40) || "DISTRIBUTOR",
        legalName: text(form, "legalName", 200),
        tradeName: text(form, "tradeName", 200) || null,
        vatNumber: text(form, "vatNumber", 40) || null,
        streetAddress: text(form, "streetAddress", 250),
        postalCode: text(form, "postalCode", 20),
        city: text(form, "city", 100),
        countryCode: text(form, "countryCode", 2).toUpperCase() || "IT",
        contactEmail: text(form, "contactEmail", 200).toLowerCase(),
        contactPhone: text(form, "contactPhone", 40) || null,
        authorisedRepresentative: text(form, "authorisedRepresentative", 200) || null,
        eprRegistrationNumber: text(form, "eprRegistrationNumber", 100) || null,
      };
      if (!data.legalName || !data.streetAddress || !data.postalCode || !data.city || !/^\S+@\S+\.\S+$/.test(data.contactEmail)) {
        return {ok: false, error: "Completa ragione sociale, indirizzo e contatto email valido."};
      }
      await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
      await prisma.complianceOperator.upsert({where: {shop: session.shop}, create: {shop: session.shop, ...data}, update: data});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, actor, action: "OPERATOR_UPDATED", details: {role: data.economicRole}}});
      return {ok: true, message: "Operatore economico salvato."};
    }

    if (intent === "createProfile") {
      const profileInput = {
        uniqueIdentifier: text(form, "uniqueIdentifier", 64).toUpperCase(),
        name: text(form, "name", 200),
        intendedUse: text(form, "intendedUse", 1000),
        packagingWeightGrams: number(form, "packagingWeightGrams"),
        lengthMm: number(form, "lengthMm"),
        widthMm: number(form, "widthMm"),
        heightMm: number(form, "heightMm"),
        productVolumeCm3: number(form, "productVolumeCm3"),
      };
      const errors = validateProfileInput(profileInput);
      if (errors.length) return {ok: false, error: errors.join(" · ")};
      const geometry = calculateEmptySpaceRatio(profileInput.lengthMm, profileInput.widthMm, profileInput.heightMm, profileInput.productVolumeCm3);
      const profile = await prisma.packagingProfile.create({data: {
        shop: session.shop,
        ...profileInput,
        packagingLevel: text(form, "packagingLevel", 40) || "ECOMMERCE",
        isReusable: checked(form, "isReusable"),
        reuseCycles: checked(form, "isReusable") ? number(form, "reuseCycles") || null : null,
        foodContact: checked(form, "foodContact"),
        emptySpaceRatio: geometry.emptySpaceRatio,
        minimisationAssessment: "Da completare: descrivere perché peso e volume non possono essere ulteriormente ridotti senza compromettere la funzionalità.",
        riskAssessment: "Da completare: analisi e valutazione dei rischi di non conformità.",
        manufacturingControls: "Da completare: controlli del processo produttivo e gestione delle variazioni.",
      }});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId: profile.id, actor, action: "PROFILE_CREATED", details: {identifier: profile.uniqueIdentifier, version: profile.version}}});
      return {ok: true, message: "Profilo creato. Collega componenti, fornitori, prove e classificazioni.", profileId: profile.id};
    }

    const profileId = text(form, "profileId", 100);
    const profile = await ownedProfile(session.shop, profileId);
    if (!profile) return {ok: false, error: "Profilo non trovato."};

    if (intent === "createVersion") {
      if (!["DECLARED", "WITHDRAWN"].includes(profile.status)) return {ok: false, error: "Una nuova versione si crea da un fascicolo dichiarato o ritirato."};
      const latest = await prisma.packagingProfile.findFirst({where: {shop: session.shop, uniqueIdentifier: profile.uniqueIdentifier}, orderBy: {version: "desc"}, select: {version: true}});
      const next = await prisma.$transaction(async (tx) => {
        const created = await tx.packagingProfile.create({data: {
          shop: session.shop,
          uniqueIdentifier: profile.uniqueIdentifier,
          version: (latest?.version || profile.version) + 1,
          name: profile.name,
          intendedUse: profile.intendedUse,
          packagingLevel: profile.packagingLevel,
          status: "DRAFT",
          isReusable: profile.isReusable,
          reuseCycles: profile.reuseCycles,
          foodContact: profile.foodContact,
          packagingWeightGrams: profile.packagingWeightGrams,
          lengthMm: profile.lengthMm,
          widthMm: profile.widthMm,
          heightMm: profile.heightMm,
          productVolumeCm3: profile.productVolumeCm3,
          emptySpaceRatio: profile.emptySpaceRatio,
          substancesStatus: "PENDING",
          recyclabilityStatus: "PENDING",
          recyclabilityGrade: null,
          recycledContentStatus: "PENDING",
          compostabilityStatus: profile.compostabilityStatus,
          labelStatus: "PENDING",
          minimisationAssessment: profile.minimisationAssessment,
          riskAssessment: profile.riskAssessment,
          manufacturingControls: profile.manufacturingControls,
          harmonisedStandards: profile.harmonisedStandards,
          commonSpecifications: profile.commonSpecifications,
          otherTechnicalSpecifications: profile.otherTechnicalSpecifications,
          applicableLegislation: profile.applicableLegislation,
        }});
        const componentMap = new Map<string, string>();
        for (const component of profile.components) {
          const copy = await tx.packagingComponent.create({data: {
            profileId: created.id,
            materialCode: component.materialCode,
            materialName: component.materialName,
            function: component.function,
            weightGrams: component.weightGrams,
            recycledContentPercent: component.recycledContentPercent,
            postConsumerPercent: component.postConsumerPercent,
            recyclingStream: component.recyclingStream,
            separable: component.separable,
            supplierName: component.supplierName,
            supplierDeclarationRef: component.supplierDeclarationRef,
            supplierId: component.supplierId,
            substancesOfConcern: component.substancesOfConcern,
            conaiMaterial: component.conaiMaterial,
            conaiContributionBand: component.conaiContributionBand,
            packagingType: component.packagingType,
            conaiClassification: component.conaiClassification ? {create: {
              shop: session.shop,
              materialFamily: component.conaiClassification.materialFamily,
              conaiMaterialCode: component.conaiClassification.conaiMaterialCode,
              contributionBand: component.conaiClassification.contributionBand,
              environmentalClass: component.conaiClassification.environmentalClass,
              packagingType: component.conaiClassification.packagingType,
              contributionEurPerTonne: component.conaiClassification.contributionEurPerTonne,
              validFrom: component.conaiClassification.validFrom,
              validTo: component.conaiClassification.validTo,
              sourceReference: component.conaiClassification.sourceReference,
              sourceUrl: component.conaiClassification.sourceUrl,
              classificationStatus: "DRAFT",
              notes: component.conaiClassification.notes,
            }} : undefined,
          }});
          componentMap.set(component.id, copy.id);
        }
        if (profile.evidence.length) await tx.complianceEvidence.createMany({data: profile.evidence.map((item) => ({
          profileId: created.id, evidenceType: item.evidenceType, title: item.title, reference: item.reference, issuer: item.issuer,
          issuedAt: item.issuedAt, expiresAt: item.expiresAt, sourceUrl: item.sourceUrl, sha256: item.sha256, notes: item.notes,
        }))});
        if (profile.supplierDeclarations.length) await tx.supplierDeclaration.createMany({data: profile.supplierDeclarations.map((item) => ({
          supplierId: item.supplierId, profileId: created.id, componentId: item.componentId ? componentMap.get(item.componentId) || null : null,
          declarationType: item.declarationType, title: item.title, reference: item.reference, status: "DRAFT", issuedAt: item.issuedAt,
          expiresAt: item.expiresAt, sourceUrl: item.sourceUrl, sha256: item.sha256, notes: item.notes,
        }))});
        if (profile.laboratoryTests.length) await tx.laboratoryTest.createMany({data: profile.laboratoryTests.map((item) => ({
          profileId: created.id, componentId: item.componentId ? componentMap.get(item.componentId) || null : null, laboratoryId: item.laboratoryId,
          testType: item.testType, reportNumber: item.reportNumber, title: item.title, standardReference: item.standardReference, method: item.method,
          sampleReference: item.sampleReference, batchNumber: item.batchNumber, resultStatus: item.resultStatus, resultSummary: item.resultSummary,
          measuredValues: item.measuredValues === null ? undefined : item.measuredValues as Prisma.InputJsonValue, issuedAt: item.issuedAt, expiresAt: item.expiresAt,
          sourceUrl: item.sourceUrl, sha256: item.sha256, verificationStatus: "PENDING",
        }))});
        await tx.complianceAuditLog.createMany({data: [
          {shop: session.shop, profileId: profile.id, actor, action: "NEW_VERSION_CREATED", details: {newProfileId: created.id, version: created.version}},
          {shop: session.shop, profileId: created.id, actor, action: "PROFILE_VERSIONED", details: {sourceProfileId: profile.id, sourceVersion: profile.version}},
        ]});
        return created;
      });
      return {ok: true, message: `Versione ${next.version} creata. Documenti copiati ma da rivalidare.`, profileId: next.id};
    }

    if (intent === "revokeSignature") {
      const reason = text(form, "revocationReason", 1000);
      if (profile.status !== "DECLARED" || !profile.declarationSignature || profile.declarationSignature.revokedAt) return {ok: false, error: "Non esiste una firma attiva da revocare."};
      if (form.get("revocationAck") !== "yes" || reason.length < 10) return {ok: false, error: "Conferma la revoca e specifica una motivazione di almeno 10 caratteri."};
      const revokedAt = new Date();
      await prisma.$transaction([
        prisma.declarationSignature.update({where: {profileId}, data: {revokedAt, revocationReason: reason}}),
        prisma.packagingProfile.update({where: {id: profileId}, data: {status: "WITHDRAWN"}}),
        prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "EU_DECLARATION_REVOKED", details: {declarationNumber: profile.declarationNumber, reason, revokedAt: revokedAt.toISOString()}}}),
      ]);
      return {ok: true, message: "Dichiarazione ritirata. Crea una nuova versione per correggere e firmare nuovamente."};
    }

    if (["DECLARED", "WITHDRAWN"].includes(profile.status)) return {ok: false, error: "Il fascicolo dichiarato o ritirato è immutabile. Crea una nuova versione per apportare modifiche."};

    if (intent === "addComponent") {
      const weightGrams = number(form, "weightGrams");
      const recycledContentPercent = number(form, "recycledContentPercent");
      const postConsumerPercent = number(form, "postConsumerPercent");
      const supplierId = text(form, "supplierId", 100);
      const supplier = await prisma.supplier.findFirst({where: {id: supplierId, shop: session.shop, status: "APPROVED"}});
      if (!supplier || !text(form, "materialCode", 40) || !text(form, "materialName", 100) || !text(form, "function", 200)
        || !Number.isFinite(weightGrams) || weightGrams <= 0 || !validPercent(recycledContentPercent) || !validPercent(postConsumerPercent)
        || postConsumerPercent > recycledContentPercent) {
        return {ok: false, error: "Controlla fornitore approvato, materiale, peso e percentuali; il post-consumo non può superare il riciclato."};
      }
      await prisma.packagingComponent.create({data: {
        profileId,
        materialCode: text(form, "materialCode", 40).toUpperCase(),
        materialName: text(form, "materialName", 100),
        function: text(form, "function", 200),
        weightGrams,
        recycledContentPercent,
        postConsumerPercent,
        recyclingStream: text(form, "recyclingStream", 100),
        separable: checked(form, "separable"),
        supplierId: supplier.id,
        supplierName: supplier.legalName,
        substancesOfConcern: text(form, "substancesOfConcern", 1000) || null,
        packagingType: enumValue(text(form, "packagingType", 40), PACKAGING_TYPES, "SECONDARY_TERTIARY"),
      }});
      await invalidateDraft(profileId);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "COMPONENT_ADDED", details: {materialCode: text(form, "materialCode", 40), weightGrams, supplierId: supplier.id}}});
      return {ok: true, message: "Componente collegato al fornitore. Ora registra dichiarazione e classificazione CONAI."};
    }

    if (intent === "addSupplierDeclaration") {
      const supplierId = text(form, "supplierId", 100);
      const componentId = text(form, "componentId", 100) || null;
      const supplier = await prisma.supplier.findFirst({where: {id: supplierId, shop: session.shop, status: "APPROVED"}});
      const component = componentId ? profile.components.find((item) => item.id === componentId) : null;
      const sourceUrl = text(form, "sourceUrl", 1000);
      const sha256 = text(form, "sha256", 64).toLowerCase();
      const errors = validateDocumentLink(sourceUrl, sha256);
      if (!supplier || (componentId && (!component || component.supplierId !== supplier.id)) || !text(form, "declarationType", 80)
        || !text(form, "title", 200) || !text(form, "reference", 200) || errors.length) {
        return {ok: false, error: ["Controlla fornitore, componente, tipo, titolo e riferimento.", ...errors].join(" · ")};
      }
      const verified = form.get("verificationAck") === "yes";
      await prisma.supplierDeclaration.create({data: {
        supplierId: supplier.id, profileId, componentId, declarationType: text(form, "declarationType", 80), title: text(form, "title", 200),
        reference: text(form, "reference", 200), status: verified ? "VERIFIED" : "DRAFT", issuedAt: formDate(form, "issuedAt"), expiresAt: formDate(form, "expiresAt"),
        sourceUrl, sha256, notes: text(form, "notes", 2000) || null, verifiedBy: verified ? actor : null, verifiedAt: verified ? new Date() : null,
      }});
      await invalidateDraft(profileId);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "SUPPLIER_DECLARATION_ADDED", details: {supplierId: supplier.id, componentId, reference: text(form, "reference", 200), verified}}});
      return {ok: true, message: verified ? "Dichiarazione fornitore verificata e registrata." : "Dichiarazione salvata in bozza."};
    }

    if (intent === "addLabTest") {
      const laboratoryId = text(form, "laboratoryId", 100);
      const componentId = text(form, "componentId", 100) || null;
      const laboratory = await prisma.testingLaboratory.findFirst({where: {id: laboratoryId, shop: session.shop, status: "APPROVED"}});
      if (componentId && !profile.components.some((item) => item.id === componentId)) return {ok: false, error: "Componente della prova non valido."};
      const sourceUrl = text(form, "sourceUrl", 1000);
      const sha256 = text(form, "sha256", 64).toLowerCase();
      const errors = validateDocumentLink(sourceUrl, sha256);
      const testType = text(form, "testType", 80).toUpperCase();
      const resultStatus = enumValue(text(form, "resultStatus", 30), TEST_RESULT_STATUSES);
      const issuedAt = formDate(form, "issuedAt", true)!;
      const measuredValues = parseMeasuredValues(text(form, "measuredValues", 20_000));
      if (!laboratory || !testType || !text(form, "reportNumber", 150) || !text(form, "title", 200)
        || !text(form, "standardReference", 500) || !text(form, "method", 2000) || !text(form, "sampleReference", 200)
        || text(form, "resultSummary", 4000).length < 10 || errors.length) {
        return {ok: false, error: ["Completa laboratorio, rapporto, norma, metodo, campione e risultato.", ...errors].join(" · ")};
      }
      const verified = form.get("verificationAck") === "yes";
      const reportNumber = text(form, "reportNumber", 150);
      await prisma.$transaction(async (tx) => {
        await tx.laboratoryTest.create({data: {
          profileId, componentId, laboratoryId: laboratory.id, testType, reportNumber, title: text(form, "title", 200),
          standardReference: text(form, "standardReference", 500), method: text(form, "method", 2000), sampleReference: text(form, "sampleReference", 200),
          batchNumber: text(form, "batchNumber", 200) || null, resultStatus, resultSummary: text(form, "resultSummary", 4000), measuredValues: measuredValues as Prisma.InputJsonValue | undefined,
          issuedAt, expiresAt: formDate(form, "expiresAt"), sourceUrl, sha256, verificationStatus: verified ? "VERIFIED" : "PENDING",
          verifiedBy: verified ? actor : null, verifiedAt: verified ? new Date() : null,
        }});
        const evidenceTypes = /SUBSTANCE|CHEMICAL|HEAVY_METAL|MIGRATION/i.test(testType) ? ["TEST_REPORT", "SUBSTANCES_TEST"] : ["TEST_REPORT"];
        await tx.complianceEvidence.createMany({data: evidenceTypes.map((evidenceType) => ({
          profileId, evidenceType, title: text(form, "title", 200), reference: reportNumber, issuer: laboratory.legalName,
          issuedAt, expiresAt: formDate(form, "expiresAt"), sourceUrl, sha256, notes: `Prova strutturata ${testType}; campione ${text(form, "sampleReference", 200)}`,
        }))});
      });
      await invalidateDraft(profileId);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "LAB_TEST_ADDED", details: {laboratoryId: laboratory.id, componentId, testType, reportNumber, resultStatus, verified}}});
      return {ok: true, message: verified ? "Rapporto di prova verificato e collegato alle evidenze." : "Rapporto di prova salvato in attesa di verifica."};
    }

    if (intent === "classifyConai") {
      const componentId = text(form, "componentId", 100);
      const component = profile.components.find((item) => item.id === componentId);
      if (!component) return {ok: false, error: "Componente non valido."};
      const materialFamily = enumValue(text(form, "materialFamily", 40), CONAI_MATERIAL_FAMILIES);
      const packagingType = enumValue(text(form, "packagingType", 40), PACKAGING_TYPES);
      const sourceUrl = text(form, "sourceUrl", 1000) || null;
      const contributionEurPerTonne = optionalNumber(form, "contributionEurPerTonne");
      if (!text(form, "conaiMaterialCode", 100) || !text(form, "sourceReference", 300) || (sourceUrl && !isHttpsUrl(sourceUrl))
        || (contributionEurPerTonne !== null && (!Number.isFinite(contributionEurPerTonne) || contributionEurPerTonne < 0))) {
        return {ok: false, error: "Completa codice, tipologia, fonte e usa un URL HTTPS; il contributo non può essere negativo."};
      }
      const verified = form.get("verificationAck") === "yes";
      const data = {
        shop: session.shop, materialFamily, conaiMaterialCode: text(form, "conaiMaterialCode", 100).toUpperCase(),
        contributionBand: text(form, "contributionBand", 80) || null, environmentalClass: text(form, "environmentalClass", 80) || null,
        packagingType, contributionEurPerTonne, validFrom: formDate(form, "validFrom", true)!, validTo: formDate(form, "validTo"),
        sourceReference: text(form, "sourceReference", 300), sourceUrl, classificationStatus: verified ? "VERIFIED" : "DRAFT",
        classifiedBy: verified ? actor : null, classifiedAt: verified ? new Date() : null, notes: text(form, "notes", 2000) || null,
      };
      await prisma.$transaction([
        prisma.conaiClassification.upsert({where: {componentId}, create: {componentId, ...data}, update: data}),
        prisma.packagingComponent.update({where: {id: componentId}, data: {conaiMaterial: materialFamily, conaiContributionBand: data.contributionBand, packagingType}}),
      ]);
      await invalidateDraft(profileId);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "CONAI_CLASSIFICATION_SAVED", details: {componentId, materialFamily, contributionBand: data.contributionBand, verified, sourceReference: data.sourceReference}}});
      return {ok: true, message: verified ? "Classificazione CONAI verificata e versionata." : "Classificazione CONAI salvata in bozza."};
    }

    if (intent === "addEvidence") {
      const sourceUrl = text(form, "sourceUrl", 1000);
      const sha256 = text(form, "sha256", 64).toLowerCase();
      if (!text(form, "evidenceType", 60) || !text(form, "evidenceTitle", 200) || !text(form, "reference", 200)
        || (sourceUrl && !isHttpsUrl(sourceUrl)) || (sha256 && !isSha256(sha256))) {
        return {ok: false, error: "Evidenza non valida: usa un URL HTTPS e, se presente, un hash SHA-256 di 64 caratteri."};
      }
      await prisma.complianceEvidence.create({data: {
        profileId, evidenceType: text(form, "evidenceType", 60), title: text(form, "evidenceTitle", 200), reference: text(form, "reference", 200),
        issuer: text(form, "issuer", 200) || null, issuedAt: formDate(form, "issuedAt"), expiresAt: formDate(form, "expiresAt"),
        sourceUrl: sourceUrl || null, sha256: sha256 || null, notes: text(form, "notes", 2000) || null,
      }});
      await invalidateDraft(profileId);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "EVIDENCE_ADDED", details: {type: text(form, "evidenceType", 60), reference: text(form, "reference", 200)}}});
      return {ok: true, message: "Evidenza registrata e audit aggiornato."};
    }

    if (intent === "evaluate") {
      const geometry = calculateEmptySpaceRatio(profile.lengthMm, profile.widthMm, profile.heightMm, profile.productVolumeCm3);
      await prisma.packagingProfile.update({where: {id: profileId}, data: {
        substancesStatus: text(form, "substancesStatus", 30), recyclabilityStatus: text(form, "recyclabilityStatus", 30),
        recyclabilityGrade: text(form, "recyclabilityGrade", 10) || null, recycledContentStatus: text(form, "recycledContentStatus", 30),
        compostabilityStatus: text(form, "compostabilityStatus", 30), labelStatus: text(form, "labelStatus", 30),
        minimisationAssessment: text(form, "minimisationAssessment", 8000), riskAssessment: text(form, "riskAssessment", 8000),
        manufacturingControls: text(form, "manufacturingControls", 8000), harmonisedStandards: text(form, "harmonisedStandards", 3000) || null,
        commonSpecifications: text(form, "commonSpecifications", 3000) || null, otherTechnicalSpecifications: text(form, "otherTechnicalSpecifications", 3000) || null,
        applicableLegislation: text(form, "applicableLegislation", 3000) || null, emptySpaceRatio: geometry.emptySpaceRatio,
      }});
      await invalidateDraft(profileId);
      const [updated, operator, manufacturer] = await Promise.all([
        ownedProfile(session.shop, profileId),
        prisma.complianceOperator.findUnique({where: {shop: session.shop}}),
        prisma.manufacturerResponsible.findUnique({where: {shop: session.shop}}),
      ]);
      if (!updated) return {ok: false, error: "Profilo non trovato dopo l'aggiornamento."};
      const evaluation = evaluatePpwr(updated, operator, manufacturer);
      await prisma.packagingProfile.update({where: {id: profileId}, data: {status: evaluation.canDeclare ? "READY_FOR_DECLARATION" : "DRAFT"}});
      await saveChecks(profileId, evaluation.checks);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "ASSESSMENT_RUN", details: {score: evaluation.completenessPercent, canDeclare: evaluation.canDeclare}}});
      return {ok: true, message: evaluation.canDeclare ? "Tutti i controlli passano: fascicolo pronto per la firma." : `Valutazione completata: ${evaluation.completenessPercent}%`};
    }

    if (intent === "declare") {
      const [operator, manufacturer] = await Promise.all([
        prisma.complianceOperator.findUnique({where: {shop: session.shop}}),
        prisma.manufacturerResponsible.findUnique({where: {shop: session.shop}}),
      ]);
      const evaluation = evaluatePpwr(profile, operator, manufacturer);
      const declarationPlace = text(form, "declarationPlace", 200);
      const typedSignature = text(form, "typedSignature", 200);
      if (!evaluation.canDeclare) return {ok: false, error: "La firma è bloccata: risolvi tutti i controlli falliti."};
      if (!operator || !manufacturer || !declarationPlace || typedSignature !== manufacturer.responsibleName
        || form.get("acceptResponsibility") !== "yes" || form.get("acceptElectronicSignature") !== "yes") {
        return {ok: false, error: "Il responsabile deve digitare il proprio nome e accettare responsabilità e attestazione elettronica."};
      }
      const declaredAt = new Date();
      const retentionUntil = new Date(declaredAt);
      retentionUntil.setFullYear(retentionUntil.getFullYear() + (profile.isReusable ? 10 : 5));
      const declarationNumber = text(form, "declarationNumber", 100) || `EU-${profile.uniqueIdentifier}-V${profile.version}`;
      const payloadProfile = {...profile, declarationNumber, declarationPlace, signatoryName: manufacturer.responsibleName, signatoryRole: manufacturer.responsibleRole, declaredAt, retentionUntil};
      const payload = buildDeclarationPayload(payloadProfile, operator, manufacturer);
      const payloadJson = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
      const payloadSha256 = hashCanonicalPayload(payloadJson);
      await prisma.$transaction(async (tx) => {
        await tx.packagingProfile.update({where: {id: profileId}, data: {
          status: "DECLARED", declarationNumber, declarationPlace, signatoryName: manufacturer.responsibleName,
          signatoryRole: manufacturer.responsibleRole, declaredAt, retentionUntil,
        }});
        await tx.declarationSignature.create({data: {
          profileId, responsibleId: manufacturer.id, declarationNumber, signerName: manufacturer.responsibleName,
          signerRole: manufacturer.responsibleRole, signerEmail: manufacturer.responsibleEmail, signatureMethod: "ELECTRONIC_ATTESTATION",
          typedSignature, attestationText: DECLARATION_ATTESTATION_TEXT, statementVersion: DECLARATION_STATEMENT_VERSION,
          payload: payloadJson, payloadSha256, actorSessionId: session.id || null, signedAt: declaredAt,
        }});
      });
      const declared = await ownedProfile(session.shop, profileId);
      if (!declared) return {ok: false, error: "Dichiarazione non rileggibile dopo la firma."};
      const finalEvaluation = evaluatePpwr(declared, operator, manufacturer);
      await saveChecks(profileId, finalEvaluation.checks);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "EU_DECLARATION_SIGNED", details: {declarationNumber, signatureMethod: "ELECTRONIC_ATTESTATION", payloadSha256, statementVersion: DECLARATION_STATEMENT_VERSION, retentionUntil: retentionUntil.toISOString()}}});
      return {ok: true, message: `Dichiarazione ${declarationNumber} firmata; hash ${payloadSha256.slice(0, 12)}… Conservazione fino al ${retentionUntil.toLocaleDateString("it-IT")}.`};
    }

    return {ok: false, error: "Operazione non riconosciuta."};
  } catch (error) {
    console.error(JSON.stringify({event: "ppwr_action_failed", shop: session.shop, intent, message: error instanceof Error ? error.message : "unknown"}));
    return {ok: false, error: error instanceof Error ? error.message : "Errore PPWR inatteso."};
  }
};

const field = {display: "grid", gap: 4} as const;
const grid = {display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12} as const;
const input = {width: "100%", padding: 9, border: "1px solid #8a8a8a", borderRadius: 6} as const;

export default function PpwrCompliance() {
  const {operator, manufacturer, suppliers, laboratories, profiles, selected, evaluation} = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const editable = Boolean(selected && !["DECLARED", "WITHDRAWN"].includes(selected.status));
  return <s-page heading="PPWR Compliance Workspace">
    <s-banner tone="info">EcoTraceIT verifica completezza, fonti e coerenza. La dichiarazione resta sotto la responsabilità del fabbricante. Configura prima <s-link href="/app/supply-chain">fornitori, laboratori e responsabile</s-link>.</s-banner>
    {result?.message && <s-banner tone="success">{result.message}</s-banner>}
    {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
    {result?.profileId && <s-banner tone="info"><s-link href={`/app/ppwr?profile=${result.profileId}`}>Apri il fascicolo creato</s-link></s-banner>}

    <s-section heading="1. Operatore economico responsabile">
      <Form method="post"><input type="hidden" name="intent" value="saveOperator" />
        <div style={grid}>
          <label style={field}>Ruolo<select name="economicRole" defaultValue={operator?.economicRole || "DISTRIBUTOR"} style={input}><option value="MANUFACTURER">Fabbricante</option><option value="IMPORTER">Importatore</option><option value="DISTRIBUTOR">Distributore</option><option value="FULFILMENT_PROVIDER">Fornitore di logistica</option></select></label>
          <label style={field}>Ragione sociale<input name="legalName" defaultValue={operator?.legalName || ""} required style={input} /></label>
          <label style={field}>Nome commerciale<input name="tradeName" defaultValue={operator?.tradeName || ""} style={input} /></label>
          <label style={field}>Partita IVA<input name="vatNumber" defaultValue={operator?.vatNumber || ""} style={input} /></label>
          <label style={field}>Indirizzo<input name="streetAddress" defaultValue={operator?.streetAddress || ""} required style={input} /></label>
          <label style={field}>CAP<input name="postalCode" defaultValue={operator?.postalCode || ""} required style={input} /></label>
          <label style={field}>Città<input name="city" defaultValue={operator?.city || ""} required style={input} /></label>
          <label style={field}>Paese ISO<input name="countryCode" defaultValue={operator?.countryCode || "IT"} minLength={2} maxLength={2} required style={input} /></label>
          <label style={field}>Email<input type="email" name="contactEmail" defaultValue={operator?.contactEmail || ""} required style={input} /></label>
          <label style={field}>Telefono<input name="contactPhone" defaultValue={operator?.contactPhone || ""} style={input} /></label>
          <label style={field}>Rappresentante autorizzato<input name="authorisedRepresentative" defaultValue={operator?.authorisedRepresentative || ""} style={input} /></label>
          <label style={field}>Registrazione EPR<input name="eprRegistrationNumber" defaultValue={operator?.eprRegistrationNumber || ""} style={input} /></label>
        </div><p><button type="submit">Salva operatore</button></p>
      </Form>
    </s-section>

    <s-section heading="2. Nuovo tipo di imballaggio">
      <Form method="post"><input type="hidden" name="intent" value="createProfile" />
        <div style={grid}>
          <label style={field}>ID univoco<input name="uniqueIdentifier" placeholder="BOX-001" required style={input} /></label>
          <label style={field}>Nome<input name="name" required style={input} /></label>
          <label style={field}>Livello<select name="packagingLevel" style={input}><option value="ECOMMERCE">E-commerce</option><option value="SALES">Vendita</option><option value="GROUPED">Multiplo</option><option value="TRANSPORT">Trasporto</option></select></label>
          <label style={field}>Peso imballaggio (g)<input type="number" name="packagingWeightGrams" min="0.01" step="0.01" required style={input} /></label>
          <label style={field}>Lunghezza (mm)<input type="number" name="lengthMm" min="0.01" step="0.01" required style={input} /></label>
          <label style={field}>Larghezza (mm)<input type="number" name="widthMm" min="0.01" step="0.01" required style={input} /></label>
          <label style={field}>Altezza (mm)<input type="number" name="heightMm" min="0.01" step="0.01" required style={input} /></label>
          <label style={field}>Volume prodotto (cm³)<input type="number" name="productVolumeCm3" min="0" step="0.01" required style={input} /></label>
          <label><input type="checkbox" name="isReusable" /> Riutilizzabile</label>
          <label style={field}>Rotazioni previste<input type="number" name="reuseCycles" min="1" style={input} /></label>
          <label><input type="checkbox" name="foodContact" /> Contatto alimentare</label>
        </div><label style={field}>Uso previsto<textarea name="intendedUse" minLength={10} required rows={3} style={input} /></label>
        <p><button type="submit">Crea fascicolo</button></p>
      </Form>
    </s-section>

    <s-section heading="Fascicoli">
      {profiles.length === 0 ? <s-paragraph>Nessun tipo di imballaggio registrato.</s-paragraph> : profiles.map((item) => <s-box key={item.id} padding="small" borderWidth="base" borderRadius="base">
        <s-link href={`/app/ppwr?profile=${item.id}`}>{item.uniqueIdentifier} v{item.version} — {item.name}</s-link>
        <s-paragraph>{item.status} · {item._count.components} componenti · {item._count.supplierDeclarations} dichiarazioni fornitore · {item._count.laboratoryTests} prove</s-paragraph>
      </s-box>)}
    </s-section>

    {selected && evaluation && <>
      <s-section heading={`3. Valutazione ${selected.uniqueIdentifier} v${selected.version}`}>
        {["DECLARED", "WITHDRAWN"].includes(selected.status) && <Form method="post"><input type="hidden" name="intent" value="createVersion" /><input type="hidden" name="profileId" value={selected.id} /><s-banner tone={selected.status === "WITHDRAWN" ? "critical" : "info"}>Fascicolo e firma sono immutabili. Per cambiare dati crea una nuova versione.</s-banner><p><button type="submit">Crea nuova versione</button></p></Form>}
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base"><s-text>Completezza</s-text><s-heading>{evaluation.completenessPercent}%</s-heading></s-box>
          <s-box padding="base" background="subdued" borderRadius="base"><s-text>Spazio vuoto</s-text><s-heading>{evaluation.calculatedEmptySpaceRatio}%</s-heading></s-box>
          <s-box padding="base" background="subdued" borderRadius="base"><s-text>Stato</s-text><s-heading>{selected.status}</s-heading></s-box>
        </s-grid>
        {evaluation.checks.map((check) => <s-paragraph key={check.code}><s-badge tone={check.status === "PASS" || check.status === "NOT_APPLICABLE" ? "success" : check.status === "WARNING" ? "info" : "critical"}>{check.status}</s-badge> <strong>{check.article}</strong> — {check.message}</s-paragraph>)}
        <s-link href={`/api/ppwr/${selected.id}`}>Scarica fascicolo tecnico JSON</s-link>{" · "}<s-link href={`/api/ppwr/${selected.id}?format=declaration`}>Apri dichiarazione UE stampabile</s-link>
      </s-section>

      <s-section heading="4. Componenti e fornitori">
        {selected.components.map((component) => <s-paragraph key={component.id}>{component.materialCode} — {component.materialName}, {component.weightGrams} g · fornitore {component.supplier?.supplierCode || "MANCANTE"} · CONAI {component.conaiClassification?.classificationStatus || "MANCANTE"}</s-paragraph>)}
        {editable && (suppliers.length ? <Form method="post"><input type="hidden" name="intent" value="addComponent" /><input type="hidden" name="profileId" value={selected.id} />
          <div style={grid}>
            <label style={field}>Codice materiale<input name="materialCode" placeholder="PAP 20" required style={input} /></label>
            <label style={field}>Materiale<input name="materialName" required style={input} /></label>
            <label style={field}>Funzione<input name="function" placeholder="Corpo, chiusura, barriera…" required style={input} /></label>
            <label style={field}>Peso (g)<input type="number" name="weightGrams" min="0.01" step="0.01" required style={input} /></label>
            <label style={field}>Contenuto riciclato %<input type="number" name="recycledContentPercent" min="0" max="100" step="0.01" defaultValue="0" required style={input} /></label>
            <label style={field}>Post-consumo %<input type="number" name="postConsumerPercent" min="0" max="100" step="0.01" defaultValue="0" required style={input} /></label>
            <label style={field}>Flusso di raccolta<input name="recyclingStream" required style={input} /></label>
            <label style={field}>Tipologia<select name="packagingType" style={input}>{PACKAGING_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label style={field}>Fornitore approvato<select name="supplierId" required style={input}><option value="">Seleziona</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierCode} · {supplier.legalName}</option>)}</select></label>
            <label><input type="checkbox" name="separable" defaultChecked /> Separabile</label>
          </div><label style={field}>Sostanze note<textarea name="substancesOfConcern" rows={2} style={input} /></label><p><button type="submit">Aggiungi componente</button></p>
        </Form> : <s-banner tone="warning">Approva almeno un fornitore nella sezione Fornitori e prove.</s-banner>)}
      </s-section>

      <s-section heading="5. Dichiarazioni dei fornitori">
        {selected.supplierDeclarations.map((item) => <s-paragraph key={item.id}><s-badge tone={item.status === "VERIFIED" ? "success" : "warning"}>{item.status}</s-badge> {item.supplier.supplierCode} · {item.declarationType} · {item.reference} · SHA {item.sha256?.slice(0, 10)}…</s-paragraph>)}
        {editable && selected.components.length > 0 && <Form method="post"><input type="hidden" name="intent" value="addSupplierDeclaration" /><input type="hidden" name="profileId" value={selected.id} />
          <div style={grid}>
            <label style={field}>Fornitore<select name="supplierId" required style={input}><option value="">Seleziona</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierCode} · {supplier.legalName}</option>)}</select></label>
            <label style={field}>Componente<select name="componentId" style={input}><option value="">Tutti i componenti del fornitore</option>{selected.components.map((component) => <option key={component.id} value={component.id}>{component.materialCode} · {component.materialName}</option>)}</select></label>
            <label style={field}>Tipo dichiarazione<select name="declarationType" style={input}><option value="MATERIAL_COMPOSITION">Composizione materiale</option><option value="RESTRICTED_SUBSTANCES">Sostanze soggette a restrizione</option><option value="RECYCLED_CONTENT">Contenuto riciclato</option><option value="FOOD_CONTACT">Contatto alimentare</option><option value="RECYCLABILITY">Riciclabilità</option></select></label>
            <label style={field}>Titolo<input name="title" required style={input} /></label>
            <label style={field}>Riferimento<input name="reference" required style={input} /></label>
            <label style={field}>Data emissione<input type="date" name="issuedAt" style={input} /></label>
            <label style={field}>Scadenza<input type="date" name="expiresAt" style={input} /></label>
            <label style={field}>URL documento HTTPS<input type="url" name="sourceUrl" required style={input} /></label>
            <label style={field}>SHA-256<input name="sha256" minLength={64} maxLength={64} required style={input} /></label>
          </div><label style={field}>Note<textarea name="notes" rows={2} style={input} /></label>
          <label><input type="checkbox" name="verificationAck" value="yes" required /> Ho verificato documento, emittente, validità e corrispondenza del file all&apos;hash.</label>
          <p><button type="submit">Registra e verifica dichiarazione</button></p>
        </Form>}
      </s-section>

      <s-section heading="6. Prove di laboratorio">
        {selected.laboratoryTests.map((test) => <s-paragraph key={test.id}><s-badge tone={test.verificationStatus === "VERIFIED" && test.resultStatus === "PASS" ? "success" : "warning"}>{test.verificationStatus}/{test.resultStatus}</s-badge> {test.testType} · {test.reportNumber} · {test.laboratory.legalName} · campione {test.sampleReference}</s-paragraph>)}
        {editable && (laboratories.length ? <Form method="post"><input type="hidden" name="intent" value="addLabTest" /><input type="hidden" name="profileId" value={selected.id} />
          <div style={grid}>
            <label style={field}>Laboratorio approvato<select name="laboratoryId" required style={input}><option value="">Seleziona</option>{laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.laboratoryCode} · {laboratory.legalName}</option>)}</select></label>
            <label style={field}>Componente<select name="componentId" style={input}><option value="">Intero imballaggio</option>{selected.components.map((component) => <option key={component.id} value={component.id}>{component.materialCode} · {component.materialName}</option>)}</select></label>
            <label style={field}>Tipo prova<select name="testType" style={input}><option value="SUBSTANCES">Sostanze / metalli pesanti</option><option value="CHEMICAL_MIGRATION">Migrazione chimica</option><option value="RECYCLABILITY">Riciclabilità</option><option value="COMPOSTABILITY">Compostabilità</option><option value="MECHANICAL">Resistenza meccanica</option><option value="RECYCLED_CONTENT">Contenuto riciclato</option></select></label>
            <label style={field}>Numero rapporto<input name="reportNumber" required style={input} /></label>
            <label style={field}>Titolo<input name="title" required style={input} /></label>
            <label style={field}>Norma / specifica<input name="standardReference" required style={input} /></label>
            <label style={field}>Campione<input name="sampleReference" required style={input} /></label>
            <label style={field}>Lotto<input name="batchNumber" style={input} /></label>
            <label style={field}>Esito<select name="resultStatus" style={input}>{TEST_RESULT_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label style={field}>Data rapporto<input type="date" name="issuedAt" required style={input} /></label>
            <label style={field}>Scadenza<input type="date" name="expiresAt" style={input} /></label>
            <label style={field}>URL rapporto HTTPS<input type="url" name="sourceUrl" required style={input} /></label>
            <label style={field}>SHA-256<input name="sha256" minLength={64} maxLength={64} required style={input} /></label>
          </div>
          <label style={field}>Metodo<textarea name="method" minLength={10} rows={3} required style={input} /></label>
          <label style={field}>Sintesi risultati<textarea name="resultSummary" minLength={10} rows={3} required style={input} /></label>
          <label style={field}>Valori misurati JSON (opzionale)<textarea name="measuredValues" rows={3} style={input} placeholder={'{"piombo_mg_kg": 12, "limite_mg_kg": 100}'}/></label>
          <label><input type="checkbox" name="verificationAck" value="yes" required /> Ho verificato accreditamento, campo di prova, campione, metodo, esito e hash.</label>
          <p><button type="submit">Registra e verifica prova</button></p>
        </Form> : <s-banner tone="warning">Approva almeno un laboratorio nella sezione Fornitori e prove.</s-banner>)}
      </s-section>

      <s-section heading="7. Classificazioni CONAI">
        {selected.components.map((component) => <s-box key={component.id} padding="base" borderWidth="base" borderRadius="base">
          <s-heading>{component.materialCode} · {component.materialName}</s-heading>
          {component.conaiClassification && <s-paragraph><s-badge tone={component.conaiClassification.classificationStatus === "VERIFIED" ? "success" : "warning"}>{component.conaiClassification.classificationStatus}</s-badge> {component.conaiClassification.materialFamily} · {component.conaiClassification.conaiMaterialCode} · fascia {component.conaiClassification.contributionBand || "n/a"} · fonte {component.conaiClassification.sourceReference}</s-paragraph>}
          {editable && <Form method="post"><input type="hidden" name="intent" value="classifyConai" /><input type="hidden" name="profileId" value={selected.id} /><input type="hidden" name="componentId" value={component.id} />
            <div style={grid}>
              <label style={field}>Famiglia<select name="materialFamily" defaultValue={component.conaiClassification?.materialFamily || "CARTA"} style={input}>{CONAI_MATERIAL_FAMILIES.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label style={field}>Codice materiale CONAI<input name="conaiMaterialCode" defaultValue={component.conaiClassification?.conaiMaterialCode || component.materialCode} required style={input} /></label>
              <label style={field}>Fascia contributiva<input name="contributionBand" defaultValue={component.conaiClassification?.contributionBand || ""} style={input} /></label>
              <label style={field}>Classe ambientale<input name="environmentalClass" defaultValue={component.conaiClassification?.environmentalClass || ""} style={input} /></label>
              <label style={field}>Tipologia<select name="packagingType" defaultValue={component.conaiClassification?.packagingType || component.packagingType || "SECONDARY_TERTIARY"} style={input}>{PACKAGING_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label style={field}>Contributo €/t<input type="number" name="contributionEurPerTonne" min="0" step="0.01" defaultValue={component.conaiClassification?.contributionEurPerTonne ?? ""} style={input} /></label>
              <label style={field}>Valido dal<input type="date" name="validFrom" defaultValue={component.conaiClassification ? new Date(component.conaiClassification.validFrom).toISOString().slice(0, 10) : ""} required style={input} /></label>
              <label style={field}>Valido fino al<input type="date" name="validTo" defaultValue={component.conaiClassification?.validTo ? new Date(component.conaiClassification.validTo).toISOString().slice(0, 10) : ""} style={input} /></label>
              <label style={field}>Fonte / delibera<input name="sourceReference" defaultValue={component.conaiClassification?.sourceReference || ""} required style={input} /></label>
              <label style={field}>URL fonte HTTPS<input type="url" name="sourceUrl" defaultValue={component.conaiClassification?.sourceUrl || ""} style={input} /></label>
            </div><label style={field}>Note<textarea name="notes" defaultValue={component.conaiClassification?.notes || ""} rows={2} style={input} /></label>
            <label><input type="checkbox" name="verificationAck" value="yes" required /> Ho verificato classificazione, periodo di validità e fonte CONAI applicabile.</label>
            <p><button type="submit">Salva e verifica classificazione</button></p>
          </Form>}
        </s-box>)}
      </s-section>

      <s-section heading="8. Altre evidenze verificabili">
        {selected.evidence.map((item) => <s-paragraph key={item.id}>{item.evidenceType}: {item.title} — {item.reference}</s-paragraph>)}
        {editable && <Form method="post"><input type="hidden" name="intent" value="addEvidence" /><input type="hidden" name="profileId" value={selected.id} />
          <div style={grid}>
            <label style={field}>Tipo<select name="evidenceType" style={input}><option>TECHNICAL_DRAWING</option><option>RECYCLABILITY_ASSESSMENT</option><option>RECYCLED_CONTENT_CERTIFICATE</option><option>COMPOSTABILITY_CERTIFICATE</option><option>FOOD_CONTACT_DECLARATION</option><option>LABEL_ARTWORK</option></select></label>
            <label style={field}>Titolo<input name="evidenceTitle" required style={input} /></label><label style={field}>Riferimento<input name="reference" required style={input} /></label>
            <label style={field}>Emittente<input name="issuer" style={input} /></label><label style={field}>Data emissione<input type="date" name="issuedAt" style={input} /></label>
            <label style={field}>Scadenza<input type="date" name="expiresAt" style={input} /></label><label style={field}>URL HTTPS<input type="url" name="sourceUrl" style={input} /></label>
            <label style={field}>SHA-256<input name="sha256" minLength={64} maxLength={64} style={input} /></label>
          </div><label style={field}>Note<textarea name="notes" rows={2} style={input} /></label><p><button type="submit">Registra evidenza</button></p>
        </Form>}
      </s-section>

      <s-section heading="9. Valutazione e fascicolo Allegato VII">
        {editable && <Form method="post"><input type="hidden" name="intent" value="evaluate" /><input type="hidden" name="profileId" value={selected.id} />
          <div style={grid}>
            {[["substancesStatus", "Sostanze Art. 5"], ["recyclabilityStatus", "Riciclabilità Art. 6"], ["recycledContentStatus", "Contenuto riciclato Art. 7"], ["labelStatus", "Etichetta Art. 12"]].map(([name, label]) => <label key={name} style={field}>{label}<select name={name} defaultValue={String(selected[name as keyof typeof selected] || "PENDING")} style={input}><option value="PENDING">Da verificare</option><option value="VERIFIED">Verificato con evidenza</option><option value="FAILED">Non conforme</option></select></label>)}
            <label style={field}>Grado riciclabilità<input name="recyclabilityGrade" defaultValue={selected.recyclabilityGrade || ""} style={input} /></label>
            <label style={field}>Compostabilità<select name="compostabilityStatus" defaultValue={selected.compostabilityStatus} style={input}><option value="NOT_APPLICABLE">Nessun claim</option><option value="CLAIMED">Claim con certificato</option></select></label>
          </div>
          <label style={field}>Valutazione minimizzazione<textarea name="minimisationAssessment" defaultValue={selected.minimisationAssessment} minLength={40} rows={4} required style={input} /></label>
          <label style={field}>Analisi rischi<textarea name="riskAssessment" defaultValue={selected.riskAssessment} minLength={40} rows={4} required style={input} /></label>
          <label style={field}>Controlli di fabbricazione<textarea name="manufacturingControls" defaultValue={selected.manufacturingControls} minLength={40} rows={4} required style={input} /></label>
          <label style={field}>Norme armonizzate<textarea name="harmonisedStandards" defaultValue={selected.harmonisedStandards || ""} rows={2} style={input} /></label>
          <label style={field}>Specifiche comuni<textarea name="commonSpecifications" defaultValue={selected.commonSpecifications || ""} rows={2} style={input} /></label>
          <label style={field}>Altre specifiche tecniche<textarea name="otherTechnicalSpecifications" defaultValue={selected.otherTechnicalSpecifications || ""} rows={2} style={input} /></label>
          <label style={field}>Altra normativa applicabile<textarea name="applicableLegislation" defaultValue={selected.applicableLegislation || ""} rows={2} style={input} /></label>
          <p><button type="submit">Esegui valutazione completa</button></p>
        </Form>}
      </s-section>

      <s-section heading="10. Dichiarazione UE e firma del responsabile">
        {selected.declarationSignature ? <>
          <s-banner tone={evaluation.signatureIntegrity ? "success" : "critical"}>Firma {evaluation.signatureIntegrity ? "integra" : "revocata o non valida"} · {selected.declarationSignature.signatureMethod} · SHA-256 {selected.declarationSignature.payloadSha256}</s-banner>
          {!selected.declarationSignature.revokedAt && <Form method="post"><input type="hidden" name="intent" value="revokeSignature" /><input type="hidden" name="profileId" value={selected.id} />
            <label style={field}>Motivazione revoca<textarea name="revocationReason" minLength={10} rows={2} required style={input} /></label>
            <label><input type="checkbox" name="revocationAck" value="yes" required /> Confermo il ritiro della dichiarazione firmata.</label>
            <p><button type="submit">Revoca dichiarazione</button></p>
          </Form>}
        </> : editable && <>
          {!manufacturer && <s-banner tone="warning">Registra il responsabile del fabbricante nella sezione Fornitori e prove.</s-banner>}
          {manufacturer && <Form method="post"><input type="hidden" name="intent" value="declare" /><input type="hidden" name="profileId" value={selected.id} />
            <s-paragraph>Firmatario: <strong>{manufacturer.responsibleName}</strong> · {manufacturer.responsibleRole} · {manufacturer.manufacturerLegalName}</s-paragraph>
            <div style={grid}>
              <label style={field}>Numero dichiarazione<input name="declarationNumber" defaultValue={selected.declarationNumber || `EU-${selected.uniqueIdentifier}-V${selected.version}`} style={input} /></label>
              <label style={field}>Luogo<input name="declarationPlace" defaultValue={selected.declarationPlace || ""} required style={input} /></label>
              <label style={field}>Digita il nome completo per firmare<input name="typedSignature" autoComplete="off" required style={input} /></label>
            </div>
            <label><input type="checkbox" name="acceptResponsibility" value="yes" required /> {DECLARATION_ATTESTATION_TEXT}</label><br />
            <label><input type="checkbox" name="acceptElectronicSignature" value="yes" required /> Accetto che nome, data, utente Shopify, snapshot e SHA-256 costituiscano l&apos;attestazione elettronica registrata da EcoTraceIT; non è una firma elettronica qualificata eIDAS.</label>
            <p><button type="submit" disabled={!evaluation.canDeclare}>Firma e registra dichiarazione</button></p>
          </Form>}
        </>}
      </s-section>

      <s-section heading="Audit trail">
        {selected.auditLogs.map((log) => <s-paragraph key={log.id}>{new Date(log.createdAt).toLocaleString("it-IT")} — {log.action} — {log.actor}</s-paragraph>)}
      </s-section>
    </>}
  </s-page>;
}
