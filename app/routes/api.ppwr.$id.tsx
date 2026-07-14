import type {LoaderFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";
import {buildTechnicalDossier, evaluatePpwr} from "../services/ppwr.server";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export const loader = async ({request, params}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const [profile, operator] = await Promise.all([
    prisma.packagingProfile.findFirst({
      where: {id: params.id, shop: session.shop},
      include: {components: true, evidence: true, checks: true, auditLogs: {orderBy: {createdAt: "asc"}}},
    }),
    prisma.complianceOperator.findUnique({where: {shop: session.shop}}),
  ]);
  if (!profile || !operator) return new Response("Fascicolo o operatore non trovato", {status: 404});
  const evaluation = evaluatePpwr(profile, operator);
  const dossier = buildTechnicalDossier(profile, operator, evaluation);
  const format = new URL(request.url).searchParams.get("format");
  const baseHeaders = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"};

  if (format !== "declaration") {
    return new Response(JSON.stringify(dossier, null, 2), {
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="PPWR-${profile.uniqueIdentifier}-v${profile.version}.json"`,
      },
    });
  }

  const standards = [profile.harmonisedStandards, profile.commonSpecifications, profile.otherTechnicalSpecifications].filter(Boolean).join("; ");
  const components = profile.components.map((component) =>
    `<li>${escapeHtml(component.materialCode)} — ${escapeHtml(component.materialName)}, ${escapeHtml(component.weightGrams)} g, funzione: ${escapeHtml(component.function)}</li>`,
  ).join("");
  const evidence = profile.evidence.map((item) =>
    `<li>${escapeHtml(item.evidenceType)} — ${escapeHtml(item.title)} (${escapeHtml(item.reference)})</li>`,
  ).join("");
  const draft = profile.status !== "DECLARED" || !evaluation.canDeclare;
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dichiarazione UE ${escapeHtml(profile.declarationNumber || profile.uniqueIdentifier)}</title>
<style>body{font:15px/1.5 Arial,sans-serif;color:#17251d;max-width:900px;margin:40px auto;padding:0 30px}h1,h2{color:#245c3c}.notice{padding:16px;border:2px solid ${draft ? "#a33" : "#287b4a"};background:${draft ? "#fff4f4" : "#f1fbf5"}}dt{font-weight:700;margin-top:14px}dd{margin-left:0}.signature{margin-top:50px;border-top:1px solid #777;padding-top:12px}@media print{button{display:none}body{margin:0}.notice{break-inside:avoid}}</style>
</head><body>
<button onclick="window.print()">Stampa / Salva PDF</button>
<h1>Dichiarazione UE di conformità n. ${escapeHtml(profile.declarationNumber || "BOZZA")}</h1>
<p class="notice"><strong>${draft ? "BOZZA NON FIRMATA — NON COSTITUISCE DICHIARAZIONE DI CONFORMITÀ" : "DICHIARAZIONE REGISTRATA"}</strong><br>
Valutazione EcoTraceIT: ${evaluation.completenessPercent}% — Regolamento (UE) 2025/40. La responsabilità della dichiarazione resta del fabbricante.</p>
<dl>
<dt>1. Identificazione univoca dell'imballaggio</dt><dd>${escapeHtml(profile.uniqueIdentifier)} — versione ${profile.version}</dd>
<dt>2. Fabbricante / operatore responsabile</dt><dd>${escapeHtml(operator.legalName)}, ${escapeHtml(operator.streetAddress)}, ${escapeHtml(operator.postalCode)} ${escapeHtml(operator.city)}, ${escapeHtml(operator.countryCode)} — ${escapeHtml(operator.contactEmail)}</dd>
<dt>3. Responsabilità</dt><dd>La presente dichiarazione è rilasciata sotto l'esclusiva responsabilità del fabbricante identificato sopra.</dd>
<dt>4. Oggetto della dichiarazione</dt><dd><strong>${escapeHtml(profile.name)}</strong>. Uso previsto: ${escapeHtml(profile.intendedUse)}. Livello: ${escapeHtml(profile.packagingLevel)}. Peso: ${profile.packagingWeightGrams} g. Dimensioni: ${profile.lengthMm} × ${profile.widthMm} × ${profile.heightMm} mm.</dd>
<dt>5. Normativa applicabile</dt><dd>Regolamento (UE) 2025/40; ${escapeHtml(profile.applicableLegislation || "nessun ulteriore atto dichiarato")}</dd>
<dt>6. Norme e specifiche tecniche</dt><dd>${escapeHtml(standards || "non indicate")}</dd>
<dt>7. Organismo notificato</dt><dd>Non indicato / non applicabile, salvo quanto riportato nelle evidenze allegate.</dd>
<dt>8. Informazioni aggiuntive</dt><dd>Spazio vuoto: ${evaluation.calculatedEmptySpaceRatio}%. Riciclabilità: ${escapeHtml(profile.recyclabilityStatus)} ${escapeHtml(profile.recyclabilityGrade || "")}. Riutilizzabile: ${profile.isReusable ? `sì, ${profile.reuseCycles || 0} rotazioni` : "no"}.</dd>
</dl>
<h2>Componenti</h2><ul>${components}</ul>
<h2>Evidenze</h2><ul>${evidence}</ul>
<h2>Esito controlli</h2><ul>${evaluation.checks.map((check) => `<li>${escapeHtml(check.status)} — ${escapeHtml(check.article)}: ${escapeHtml(check.message)}</li>`).join("")}</ul>
<div class="signature"><p>Firmato a nome e per conto di: <strong>${escapeHtml(profile.signatoryName || "")}</strong></p>
<p>Ruolo: ${escapeHtml(profile.signatoryRole || "")} · Luogo: ${escapeHtml(profile.declarationPlace || "")} · Data: ${profile.declaredAt ? escapeHtml(profile.declaredAt.toISOString().slice(0, 10)) : ""}</p>
<p>Conservare fino al: ${profile.retentionUntil ? escapeHtml(profile.retentionUntil.toISOString().slice(0, 10)) : "da determinare alla firma"}</p></div>
</body></html>`;
  return new Response(html, {headers: {...baseHeaders, "Content-Type": "text/html; charset=utf-8"}});
};
