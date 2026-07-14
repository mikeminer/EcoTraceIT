import type {LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {aggregateEpr} from "../services/epr.server";

export async function loader({request}: LoaderFunctionArgs) {
  const {session} = await authenticate.admin(request);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const orders = await prisma.sustainabilityOrder.findMany({where: {shop: session.shop, calculatedAt: {gte: from, lte: now}}, select: {packagingProfileId: true, calculatedAt: true}});
  const ids = [...new Set(orders.flatMap((o) => o.packagingProfileId ? [o.packagingProfileId] : []))];
  const profiles = await prisma.packagingProfile.findMany({where: {shop: session.shop, id: {in: ids}}, include: {components: {include: {conaiClassification: true}}}});
  return {report: aggregateEpr(orders, profiles), from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10)};
}

export default function EprPage() {
  const {report, from, to} = useLoaderData<typeof loader>();
  return <s-page heading="EPR / CONAI">
    <s-banner tone={report.unmatchedOrders ? "warning" : "info"}>Report quantitativo di supporto. Non sostituisce la dichiarazione CONAI né la verifica della posizione consortile. Ordini senza dossier: {report.unmatchedOrders}.</s-banner>
    <s-section heading="Esporta periodo">
      <form action="/api/epr" method="get"><label>Dal <input type="date" name="from" defaultValue={from} /></label> <label>Al <input type="date" name="to" defaultValue={to} /></label> <button type="submit">Scarica CSV</button></form>
    </s-section>
    <s-section heading="Mese corrente">
      {report.rows.map((row) => <s-box key={row.materialCode + row.contributionBand + row.sourceReference} padding="base" borderWidth="base"><s-heading>{row.materialCode} · {row.materialName}</s-heading><s-text>{row.grossKg.toFixed(3)} kg · riciclato {row.recycledKg.toFixed(3)} kg · CONAI {row.conaiMaterial}/{row.contributionBand} · {row.classificationStatus} · fonte {row.sourceReference} · {row.units} unità</s-text></s-box>)}
    </s-section>
  </s-page>;
}
