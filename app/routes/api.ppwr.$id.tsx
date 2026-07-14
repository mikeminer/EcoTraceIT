import type {LoaderFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";
import {buildTechnicalDossier, evaluatePpwr} from "../services/ppwr.server";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const isoDate = (value?: Date | string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";

export const loader = async ({request, params}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const [profile, operator, manufacturer] = await Promise.all([
    prisma.packagingProfile.findFirst({
      where: {id: params.id, shop: session.shop},
      include: {
        components: {include: {supplier: true, conaiClassification: true}},
        evidence: true,
        supplierDeclarations: {include: {supplier: true}},
        laboratoryTests: {include: {laboratory: true}},
        declarationSignature: true,
        checks: true,
        auditLogs: {orderBy: {createdAt: "asc"}},
      },
    }),
    prisma.complianceOperator.findUnique({where: {shop: session.shop}}),
    prisma.manufacturerResponsible.findUnique({where: {shop: session.shop}}),
  ]);
  if (!profile || !operator) return new Response("Fascicolo o operatore non trovato", {status: 404});
  const manufacturerData = manufacturer || {};
  const evaluation = evaluatePpwr(profile, operator, manufacturerData);
  const dossier = buildTechnicalDossier(profile, operator, manufacturerData, evaluation);
  const format = new URL(request.url).searchParams.get("format");
  const baseHeaders = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"};

  if (format !== "declaration") {
    return new Response(JSON.stringify(dossier, null, 2), {
      headers: {...baseHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="PPWR-${profile.uniqueIdentifier}-v${profile.version}.json"`},
    });
  }

  const signedPayload = profile.declarationSignature?.payload as {
    manufacturer?: {manufacturerLegalName?: unknown; streetAddress?: unknown; postalCode?: unknown; city?: unknown; countryCode?: unknown; responsibleName?: unknown; responsibleRole?: unknown; responsibleEmail?: unknown};
  } | undefined;
  const signedManufacturer = signedPayload?.manufacturer || {
    manufacturerLegalName: manufacturer?.manufacturerLegalName,
    streetAddress: manufacturer?.streetAddress,
    postalCode: manufacturer?.postalCode,
    city: manufacturer?.city,
    countryCode: manufacturer?.countryCode,
    responsibleName: manufacturer?.responsibleName,
    responsibleRole: manufacturer?.responsibleRole,
    responsibleEmail: manufacturer?.responsibleEmail,
  };
  const standards = [profile.harmonisedStandards, profile.commonSpecifications, profile.otherTechnicalSpecifications].filter(Boolean).join("; ");
  const components = profile.components.map((component) =>
    `<li>${escapeHtml(component.materialCode)} — ${escapeHtml(component.materialName)}, ${escapeHtml(component.weightGrams)} g; funzione: ${escapeHtml(component.function)}; fornitore: ${escapeHtml(component.supplier?.legalName || "non collegato")}; CONAI: ${escapeHtml(component.conaiClassification?.materialFamily || "non classificato")} ${escapeHtml(component.conaiClassification?.contributionBand || "")}</li>`,
  ).join("");
  const supplierDeclarations = profile.supplierDeclarations.map((item) =>
    `<li>${escapeHtml(item.supplier.legalName)} — ${escapeHtml(item.declarationType)} — ${escapeHtml(item.reference)} — ${escapeHtml(item.status)} — SHA-256 ${escapeHtml(item.sha256 || "non indicato")}</li>`,
  ).join("");
  const laboratoryTests = profile.laboratoryTests.map((item) =>
    `<li>${escapeHtml(item.testType)} — rapporto ${escapeHtml(item.reportNumber)} — ${escapeHtml(item.laboratory.legalName)} (${escapeHtml(item.laboratory.accreditationBody)} ${escapeHtml(item.laboratory.accreditationNumber)}) — campione ${escapeHtml(item.sampleReference)} — ${escapeHtml(item.verificationStatus)}/${escapeHtml(item.resultStatus)} — SHA-256 ${escapeHtml(item.sha256)}</li>`,
  ).join("");
  const evidence = profile.evidence.map((item) =>
    `<li>${escapeHtml(item.evidenceType)} — ${escapeHtml(item.title)} (${escapeHtml(item.reference)})${item.sha256 ? ` — SHA-256 ${escapeHtml(item.sha256)}` : ""}</li>`,
  ).join("");
  const signature = profile.declarationSignature;
  const draft = profile.status !== "DECLARED" || !evaluation.canDeclare || !evaluation.signatureIntegrity;
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dichiarazione UE ${escapeHtml(profile.declarationNumber || profile.uniqueIdentifier)}</title>
<style>body{font:15px/1.5 Arial,sans-serif;color:#17251d;max-width:900px;margin:40px auto;padding:0 30px}h1,h2{color:#245c3c}.notice{padding:16px;border:2px solid ${draft ? "#a33" : "#287b4a"};background:${draft ? "#fff4f4" : "#f1fbf5"}}dt{font-weight:700;margin-top:14px}dd{margin-left:0}.signature{margin-top:50px;border-top:1px solid #777;padding-top:12px;overflow-wrap:anywhere}@media print{button{display:none}body{margin:0}.notice{break-inside:avoid}}</style>
</head><body>
<button onclick="window.print()">Stampa / Salva PDF</button>
<h1>Dichiarazione UE di conformità n. ${escapeHtml(profile.declarationNumber || "BOZZA")}</h1>
<p class="notice"><strong>${draft ? "BOZZA O FIRMA NON INTEGRA — NON COSTITUISCE DICHIARAZIONE DI CONFORMITÀ" : "DICHIARAZIONE REGISTRATA — HASH VERIFICATO"}</strong><br>
Valutazione EcoTraceIT: ${evaluation.completenessPercent}% — Regolamento (UE) 2025/40. La responsabilità della dichiarazione resta del fabbricante.</p>
<dl>
<dt>1. Identificazione univoca dell'imballaggio</dt><dd>${escapeHtml(profile.uniqueIdentifier)} — versione ${profile.version}</dd>
<dt>2. Fabbricante</dt><dd>${escapeHtml(signedManufacturer.manufacturerLegalName)}, ${escapeHtml(signedManufacturer.streetAddress)}, ${escapeHtml(signedManufacturer.postalCode)} ${escapeHtml(signedManufacturer.city)}, ${escapeHtml(signedManufacturer.countryCode)}</dd>
<dt>3. Responsabilità</dt><dd>La presente dichiarazione è rilasciata sotto l'esclusiva responsabilità del fabbricante identificato sopra.</dd>
<dt>4. Oggetto della dichiarazione</dt><dd><strong>${escapeHtml(profile.name)}</strong>. Uso previsto: ${escapeHtml(profile.intendedUse)}. Livello: ${escapeHtml(profile.packagingLevel)}. Peso: ${profile.packagingWeightGrams} g. Dimensioni: ${profile.lengthMm} × ${profile.widthMm} × ${profile.heightMm} mm.</dd>
<dt>5. Normativa applicabile</dt><dd>Regolamento (UE) 2025/40; ${escapeHtml(profile.applicableLegislation || "nessun ulteriore atto dichiarato")}</dd>
<dt>6. Norme e specifiche tecniche</dt><dd>${escapeHtml(standards || "non indicate")}</dd>
<dt>7. Organismi e laboratori</dt><dd>${profile.laboratoryTests.length ? "I laboratori e gli accreditamenti sono elencati nei rapporti di prova." : "Non indicati."}</dd>
<dt>8. Informazioni aggiuntive</dt><dd>Spazio vuoto: ${evaluation.calculatedEmptySpaceRatio}%. Riciclabilità: ${escapeHtml(profile.recyclabilityStatus)} ${escapeHtml(profile.recyclabilityGrade || "")}. Riutilizzabile: ${profile.isReusable ? `sì, ${profile.reuseCycles || 0} rotazioni` : "no"}.</dd>
</dl>
<h2>Componenti, fornitori e CONAI</h2><ul>${components}</ul>
<h2>Dichiarazioni dei fornitori</h2><ul>${supplierDeclarations || "<li>Nessuna</li>"}</ul>
<h2>Prove di laboratorio</h2><ul>${laboratoryTests || "<li>Nessuna</li>"}</ul>
<h2>Altre evidenze</h2><ul>${evidence}</ul>
<h2>Esito controlli</h2><ul>${evaluation.checks.map((check) => `<li>${escapeHtml(check.status)} — ${escapeHtml(check.article)}: ${escapeHtml(check.message)}</li>`).join("")}</ul>
<div class="signature"><p>Firmato a nome e per conto del fabbricante da: <strong>${escapeHtml(signature?.signerName || signedManufacturer.responsibleName || "")}</strong></p>
<p>Ruolo: ${escapeHtml(signature?.signerRole || signedManufacturer.responsibleRole || "")} · Email professionale: ${escapeHtml(signature?.signerEmail || signedManufacturer.responsibleEmail || "")}</p>
<p>Metodo: ${escapeHtml(signature?.signatureMethod || "NON FIRMATA")} · Luogo: ${escapeHtml(profile.declarationPlace || "")} · Data: ${isoDate(signature?.signedAt || profile.declaredAt)}</p>
<p>Versione attestazione: ${escapeHtml(signature?.statementVersion || "")}<br>SHA-256 snapshot firmato: <strong>${escapeHtml(signature?.payloadSha256 || "")}</strong></p>
<p>Conservare fino al: ${isoDate(profile.retentionUntil) || "da determinare alla firma"}</p></div>
</body></html>`;
  return new Response(html, {headers: {...baseHeaders, "Content-Type": "text/html; charset=utf-8"}});
};
