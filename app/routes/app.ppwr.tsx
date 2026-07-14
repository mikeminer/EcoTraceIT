import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";
import {calculateEmptySpaceRatio, evaluatePpwr, validateProfileInput} from "../services/ppwr.server";

const text = (form: FormData, key: string, max = 4000) => String(form.get(key) || "").trim().slice(0, max);
const number = (form: FormData, key: string) => Number(form.get(key));
const checked = (form: FormData, key: string) => form.get(key) === "on";
const validPercent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

async function ownedProfile(shop: string, id: string) {
  return prisma.packagingProfile.findFirst({
    where: {id, shop},
    include: {components: true, evidence: true, checks: true},
  });
}

async function saveChecks(profileId: string, checks: ReturnType<typeof evaluatePpwr>["checks"]) {
  await prisma.$transaction(checks.map((check) => prisma.complianceCheck.upsert({
    where: {profileId_code: {profileId, code: check.code}},
    create: {profileId, ...check},
    update: {article: check.article, status: check.status, message: check.message, checkedAt: new Date()},
  })));
}

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  const selectedId = new URL(request.url).searchParams.get("profile");
  const [operator, profiles, selected] = await Promise.all([
    prisma.complianceOperator.findUnique({where: {shop: session.shop}}),
    prisma.packagingProfile.findMany({
      where: {shop: session.shop},
      orderBy: {updatedAt: "desc"},
      include: {_count: {select: {components: true, evidence: true}}, checks: true},
    }),
    selectedId ? prisma.packagingProfile.findFirst({
      where: {id: selectedId, shop: session.shop},
      include: {components: true, evidence: {orderBy: {createdAt: "desc"}}, checks: true, auditLogs: {orderBy: {createdAt: "desc"}, take: 20}},
    }) : null,
  ]);
  return {operator, profiles, selected, evaluation: selected ? evaluatePpwr(selected, operator) : null};
};

export const action = async ({request}: ActionFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const intent = text(form, "intent", 40);
  const actor = session.shop;

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
      return {ok: true, message: "Profilo creato. Aggiungi componenti ed evidenze.", profileId: profile.id};
    }

    const profileId = text(form, "profileId", 100);
    const profile = await ownedProfile(session.shop, profileId);
    if (!profile) return {ok: false, error: "Profilo non trovato."};

    if (intent === "createVersion") {
      if (profile.status !== "DECLARED") return {ok: false, error: "Una nuova versione si crea da un fascicolo dichiarato."};
      const latest = await prisma.packagingProfile.findFirst({
        where: {shop: session.shop, uniqueIdentifier: profile.uniqueIdentifier},
        orderBy: {version: "desc"},
        select: {version: true},
      });
      const next = await prisma.packagingProfile.create({data: {
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
        components: {create: profile.components.map((component) => ({
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
          substancesOfConcern: component.substancesOfConcern,
          conaiMaterial: component.conaiMaterial,
          conaiContributionBand: component.conaiContributionBand,
          packagingType: component.packagingType,
        }))},
        evidence: {create: profile.evidence.map((item) => ({
          evidenceType: item.evidenceType,
          title: item.title,
          reference: item.reference,
          issuer: item.issuer,
          issuedAt: item.issuedAt,
          expiresAt: item.expiresAt,
          sourceUrl: item.sourceUrl,
          sha256: item.sha256,
          notes: item.notes,
        }))},
      }});
      await prisma.complianceAuditLog.createMany({data: [
        {shop: session.shop, profileId: profile.id, actor, action: "NEW_VERSION_CREATED", details: {newProfileId: next.id, version: next.version}},
        {shop: session.shop, profileId: next.id, actor, action: "PROFILE_VERSIONED", details: {sourceProfileId: profile.id, sourceVersion: profile.version}},
      ]});
      return {ok: true, message: `Versione ${next.version} creata in bozza. Rivalida evidenze e requisiti.`, profileId: next.id};
    }

    if (profile.status === "DECLARED") {
      return {ok: false, error: "Il fascicolo dichiarato è immutabile. Crea una nuova versione per apportare modifiche."};
    }
    if (intent === "addComponent") {
      const weightGrams = number(form, "weightGrams");
      const recycledContentPercent = number(form, "recycledContentPercent");
      const postConsumerPercent = number(form, "postConsumerPercent");
      if (!text(form, "materialCode", 40) || !text(form, "materialName", 100) || !text(form, "function", 200)
        || !Number.isFinite(weightGrams) || weightGrams <= 0 || !validPercent(recycledContentPercent) || !validPercent(postConsumerPercent)
        || postConsumerPercent > recycledContentPercent) {
        return {ok: false, error: "Controlla materiale, peso e percentuali; il post-consumo non può superare il contenuto riciclato."};
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
        supplierName: text(form, "supplierName", 200) || null,
        supplierDeclarationRef: text(form, "supplierDeclarationRef", 200) || null,
        substancesOfConcern: text(form, "substancesOfConcern", 1000) || null,
        conaiMaterial: text(form, "conaiMaterial", 40).toUpperCase() || null,
        conaiContributionBand: text(form, "conaiContributionBand", 40) || null,
        packagingType: text(form, "packagingType", 40) || "SECONDARY_TERTIARY",
      }});
      await prisma.packagingProfile.update({where: {id: profileId}, data: {status: "DRAFT", declarationNumber: null, declaredAt: null, retentionUntil: null}});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "COMPONENT_ADDED", details: {materialCode: text(form, "materialCode", 40), weightGrams}}});
      return {ok: true, message: "Componente aggiunto; una precedente dichiarazione è stata invalidata."};
    }

    if (intent === "addEvidence") {
      const sourceUrl = text(form, "sourceUrl", 1000);
      const sha256 = text(form, "sha256", 64).toLowerCase();
      if (!text(form, "evidenceType", 60) || !text(form, "evidenceTitle", 200) || !text(form, "reference", 200)
        || (sourceUrl && !/^https:\/\//i.test(sourceUrl)) || (sha256 && !/^[a-f0-9]{64}$/.test(sha256))) {
        return {ok: false, error: "Evidenza non valida: usa un URL HTTPS e, se presente, un hash SHA-256 di 64 caratteri."};
      }
      await prisma.complianceEvidence.create({data: {
        profileId,
        evidenceType: text(form, "evidenceType", 60),
        title: text(form, "evidenceTitle", 200),
        reference: text(form, "reference", 200),
        issuer: text(form, "issuer", 200) || null,
        issuedAt: text(form, "issuedAt", 10) ? new Date(text(form, "issuedAt", 10)) : null,
        expiresAt: text(form, "expiresAt", 10) ? new Date(text(form, "expiresAt", 10)) : null,
        sourceUrl: sourceUrl || null,
        sha256: sha256 || null,
        notes: text(form, "notes", 2000) || null,
      }});
      await prisma.packagingProfile.update({where: {id: profileId}, data: {status: "DRAFT", declarationNumber: null, declaredAt: null, retentionUntil: null}});
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "EVIDENCE_ADDED", details: {type: text(form, "evidenceType", 60), reference: text(form, "reference", 200)}}});
      return {ok: true, message: "Evidenza registrata e audit aggiornato."};
    }

    if (intent === "evaluate") {
      const geometry = calculateEmptySpaceRatio(profile.lengthMm, profile.widthMm, profile.heightMm, profile.productVolumeCm3);
      const updated = await prisma.packagingProfile.update({where: {id: profileId}, data: {
        substancesStatus: text(form, "substancesStatus", 30),
        recyclabilityStatus: text(form, "recyclabilityStatus", 30),
        recyclabilityGrade: text(form, "recyclabilityGrade", 10) || null,
        recycledContentStatus: text(form, "recycledContentStatus", 30),
        compostabilityStatus: text(form, "compostabilityStatus", 30),
        labelStatus: text(form, "labelStatus", 30),
        minimisationAssessment: text(form, "minimisationAssessment", 8000),
        riskAssessment: text(form, "riskAssessment", 8000),
        manufacturingControls: text(form, "manufacturingControls", 8000),
        harmonisedStandards: text(form, "harmonisedStandards", 3000) || null,
        commonSpecifications: text(form, "commonSpecifications", 3000) || null,
        otherTechnicalSpecifications: text(form, "otherTechnicalSpecifications", 3000) || null,
        applicableLegislation: text(form, "applicableLegislation", 3000) || null,
        emptySpaceRatio: geometry.emptySpaceRatio,
        status: "DRAFT",
        declarationNumber: null,
        declaredAt: null,
        retentionUntil: null,
      }, include: {components: true, evidence: true}});
      const operator = await prisma.complianceOperator.findUnique({where: {shop: session.shop}});
      const evaluation = evaluatePpwr(updated, operator);
      await prisma.packagingProfile.update({where: {id: profileId}, data: {status: evaluation.canDeclare ? "READY_FOR_DECLARATION" : "DRAFT"}});
      await saveChecks(profileId, evaluation.checks);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "ASSESSMENT_RUN", details: {score: evaluation.completenessPercent, canDeclare: evaluation.canDeclare}}});
      return {ok: true, message: evaluation.canDeclare ? "Tutti i controlli passano: fascicolo pronto per la firma." : `Valutazione completata: ${evaluation.completenessPercent}%`};
    }

    if (intent === "declare") {
      const operator = await prisma.complianceOperator.findUnique({where: {shop: session.shop}});
      const evaluation = evaluatePpwr(profile, operator);
      const signatoryName = text(form, "signatoryName", 200);
      const signatoryRole = text(form, "signatoryRole", 200);
      const declarationPlace = text(form, "declarationPlace", 200);
      if (!evaluation.canDeclare) return {ok: false, error: "La firma è bloccata: risolvi tutti i controlli falliti."};
      if (form.get("acceptResponsibility") !== "yes" || !signatoryName || !signatoryRole || !declarationPlace) {
        return {ok: false, error: "Il firmatario deve identificarsi e assumere esplicitamente la responsabilità della dichiarazione."};
      }
      const declaredAt = new Date();
      const retentionUntil = new Date(declaredAt);
      retentionUntil.setFullYear(retentionUntil.getFullYear() + (profile.isReusable ? 10 : 5));
      const declarationNumber = text(form, "declarationNumber", 100) || `EU-${profile.uniqueIdentifier}-V${profile.version}`;
      const declared = await prisma.packagingProfile.update({where: {id: profileId}, data: {
        status: "DECLARED", declarationNumber, declarationPlace, signatoryName, signatoryRole, declaredAt, retentionUntil,
      }, include: {components: true, evidence: true}});
      const finalEvaluation = evaluatePpwr(declared, operator);
      await saveChecks(profileId, finalEvaluation.checks);
      await prisma.complianceAuditLog.create({data: {shop: session.shop, profileId, actor, action: "EU_DECLARATION_SIGNED", details: {declarationNumber, signatoryName, signatoryRole, retentionUntil: retentionUntil.toISOString()}}});
      return {ok: true, message: `Dichiarazione ${declarationNumber} registrata. Conservazione fino al ${retentionUntil.toLocaleDateString("it-IT")}.`};
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
  const {operator, profiles, selected, evaluation} = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="PPWR Compliance Workspace">
      <s-banner tone="info">EcoTraceIT verifica completezza e coerenza del fascicolo. La conformità viene dichiarata esclusivamente dal fabbricante o responsabile autorizzato.</s-banner>
      {result?.message && <s-banner tone="success">{result.message}</s-banner>}
      {result?.error && <s-banner tone="critical">{result.error}</s-banner>}

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
            <label style={field}>Paese<input name="countryCode" defaultValue={operator?.countryCode || "IT"} maxLength={2} required style={input} /></label>
            <label style={field}>Email compliance<input type="email" name="contactEmail" defaultValue={operator?.contactEmail || ""} required style={input} /></label>
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
        {profiles.length === 0 ? <s-paragraph>Nessun tipo di imballaggio registrato.</s-paragraph> : profiles.map((profile) => (
          <s-box key={profile.id} padding="small" borderWidth="base" borderRadius="base">
            <s-link href={`/app/ppwr?profile=${profile.id}`}>{profile.uniqueIdentifier} v{profile.version} — {profile.name}</s-link>
            <s-paragraph>{profile.status} · {profile._count.components} componenti · {profile._count.evidence} evidenze</s-paragraph>
          </s-box>
        ))}
      </s-section>

      {selected && evaluation && <>
        <s-section heading={`3. Valutazione ${selected.uniqueIdentifier} v${selected.version}`}>
          {selected.status === "DECLARED" && <Form method="post"><input type="hidden" name="intent" value="createVersion" /><input type="hidden" name="profileId" value={selected.id} /><s-banner tone="info">Questo fascicolo è immutabile. Per cambiare dati o documenti crea una nuova versione.</s-banner><p><button type="submit">Crea nuova versione</button></p></Form>}
          <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
            <s-box padding="base" background="subdued" borderRadius="base"><s-text>Completezza</s-text><s-heading>{evaluation.completenessPercent}%</s-heading></s-box>
            <s-box padding="base" background="subdued" borderRadius="base"><s-text>Spazio vuoto</s-text><s-heading>{evaluation.calculatedEmptySpaceRatio}%</s-heading></s-box>
            <s-box padding="base" background="subdued" borderRadius="base"><s-text>Stato</s-text><s-heading>{selected.status}</s-heading></s-box>
          </s-grid>
          {evaluation.checks.map((check) => <s-paragraph key={check.code}><s-badge tone={check.status === "PASS" || check.status === "NOT_APPLICABLE" ? "success" : check.status === "WARNING" ? "info" : "critical"}>{check.status}</s-badge> <strong>{check.article}</strong> — {check.message}</s-paragraph>)}
          <s-link href={`/api/ppwr/${selected.id}`}>Scarica fascicolo tecnico JSON</s-link>{" · "}<s-link href={`/api/ppwr/${selected.id}?format=declaration`}>Apri dichiarazione UE stampabile</s-link>
        </s-section>

        <s-section heading="4. Componenti e materiali">
          {selected.components.map((component) => <s-paragraph key={component.id}>{component.materialCode} — {component.materialName}, {component.weightGrams} g, riciclato {component.recycledContentPercent}%</s-paragraph>)}
          <Form method="post"><input type="hidden" name="intent" value="addComponent" /><input type="hidden" name="profileId" value={selected.id} />
            <div style={grid}>
              <label style={field}>Codice materiale<input name="materialCode" placeholder="PAP 20" required style={input} /></label>
              <label style={field}>Materiale<input name="materialName" required style={input} /></label>
              <label style={field}>Funzione<input name="function" placeholder="Corpo, chiusura, barriera…" required style={input} /></label>
              <label style={field}>Peso (g)<input type="number" name="weightGrams" min="0.01" step="0.01" required style={input} /></label>
              <label style={field}>Contenuto riciclato %<input type="number" name="recycledContentPercent" min="0" max="100" step="0.01" defaultValue="0" required style={input} /></label>
              <label style={field}>Post-consumo %<input type="number" name="postConsumerPercent" min="0" max="100" step="0.01" defaultValue="0" required style={input} /></label>
              <label style={field}>Flusso di raccolta<input name="recyclingStream" required style={input} /></label>
              <label style={field}>Materiale CONAI<select name="conaiMaterial" style={input}><option value="">Da classificare</option><option>CARTA</option><option>PLASTICA</option><option>LEGNO</option><option>VETRO</option><option>ACCIAIO</option><option>ALLUMINIO</option><option>BIOPLASTICA</option></select></label>
              <label style={field}>Fascia contributiva CONAI<input name="conaiContributionBand" placeholder="es. 1 / A1.1" style={input} /></label>
              <label style={field}>Tipologia<select name="packagingType" style={input}><option value="PRIMARY">Primario</option><option value="SECONDARY_TERTIARY">Secondario/terziario</option></select></label>
              <label style={field}>Fornitore<input name="supplierName" style={input} /></label>
              <label style={field}>Rif. dichiarazione fornitore<input name="supplierDeclarationRef" style={input} /></label>
              <label><input type="checkbox" name="separable" defaultChecked /> Separabile</label>
            </div><label style={field}>Sostanze note<textarea name="substancesOfConcern" rows={2} style={input} /></label>
            <p><button type="submit">Aggiungi componente</button></p>
          </Form>
        </s-section>

        <s-section heading="5. Evidenze verificabili">
          {selected.evidence.map((item) => <s-paragraph key={item.id}>{item.evidenceType}: {item.title} — {item.reference}</s-paragraph>)}
          <Form method="post"><input type="hidden" name="intent" value="addEvidence" /><input type="hidden" name="profileId" value={selected.id} />
            <div style={grid}>
              <label style={field}>Tipo<select name="evidenceType" style={input}><option>TECHNICAL_DRAWING</option><option>SUPPLIER_DECLARATION</option><option>SUBSTANCES_TEST</option><option>RECYCLABILITY_ASSESSMENT</option><option>RECYCLED_CONTENT_CERTIFICATE</option><option>COMPOSTABILITY_CERTIFICATE</option><option>FOOD_CONTACT_DECLARATION</option><option>TEST_REPORT</option><option>LABEL_ARTWORK</option></select></label>
              <label style={field}>Titolo<input name="evidenceTitle" required style={input} /></label>
              <label style={field}>Riferimento<input name="reference" required style={input} /></label>
              <label style={field}>Emittente<input name="issuer" style={input} /></label>
              <label style={field}>Data emissione<input type="date" name="issuedAt" style={input} /></label>
              <label style={field}>Scadenza<input type="date" name="expiresAt" style={input} /></label>
              <label style={field}>URL HTTPS<input type="url" name="sourceUrl" style={input} /></label>
              <label style={field}>SHA-256<input name="sha256" minLength={64} maxLength={64} style={input} /></label>
            </div><label style={field}>Note<textarea name="notes" rows={2} style={input} /></label>
            <p><button type="submit">Registra evidenza</button></p>
          </Form>
        </s-section>

        <s-section heading="6. Valutazione e fascicolo Allegato VII">
          <Form method="post"><input type="hidden" name="intent" value="evaluate" /><input type="hidden" name="profileId" value={selected.id} />
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
          </Form>
        </s-section>

        <s-section heading="7. Dichiarazione UE di conformità">
          <Form method="post"><input type="hidden" name="intent" value="declare" /><input type="hidden" name="profileId" value={selected.id} />
            <div style={grid}>
              <label style={field}>Numero dichiarazione<input name="declarationNumber" defaultValue={selected.declarationNumber || `EU-${selected.uniqueIdentifier}-V${selected.version}`} style={input} /></label>
              <label style={field}>Luogo<input name="declarationPlace" defaultValue={selected.declarationPlace || ""} required style={input} /></label>
              <label style={field}>Nome firmatario<input name="signatoryName" defaultValue={selected.signatoryName || ""} required style={input} /></label>
              <label style={field}>Ruolo firmatario<input name="signatoryRole" defaultValue={selected.signatoryRole || ""} required style={input} /></label>
            </div>
            <label><input type="checkbox" name="acceptResponsibility" value="yes" required /> Dichiaro, sotto la responsabilità dell&apos;operatore indicato, che le informazioni e le evidenze sono accurate e che sono state soddisfatte le prescrizioni applicabili.</label>
            <p><button type="submit" disabled={!evaluation.canDeclare}>Firma e registra dichiarazione</button></p>
          </Form>
        </s-section>

        <s-section heading="Audit trail">
          {selected.auditLogs.map((log) => <s-paragraph key={log.id}>{new Date(log.createdAt).toLocaleString("it-IT")} — {log.action} — {log.actor}</s-paragraph>)}
        </s-section>
      </>}
    </s-page>
  );
}
