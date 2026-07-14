import type {LoaderFunctionArgs} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {aggregateEpr, eprCsv} from "../services/epr.server";

function parsePeriod(url: URL) {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from") + "T00:00:00.000Z") : defaultFrom;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to") + "T23:59:59.999Z") : now;
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || from > to) throw new Response("Periodo non valido", {status: 400});
  return {from, to};
}

export async function loader({request}: LoaderFunctionArgs) {
  const {session} = await authenticate.admin(request);
  const {from, to} = parsePeriod(new URL(request.url));
  const orders = await prisma.sustainabilityOrder.findMany({where: {shop: session.shop, calculatedAt: {gte: from, lte: to}}, select: {packagingProfileId: true, calculatedAt: true}});
  const profileIds = [...new Set(orders.flatMap((order) => order.packagingProfileId ? [order.packagingProfileId] : []))];
  const profiles = await prisma.packagingProfile.findMany({where: {shop: session.shop, id: {in: profileIds}}, include: {components: {include: {conaiClassification: true}}}});
  const report = aggregateEpr(orders, profiles);
  const format = new URL(request.url).searchParams.get("format");
  if (format === "json") return Response.json({period: {from, to}, ...report, disclaimer: "Dataset operativo di supporto: verificare classificazioni e obblighi con CONAI/professionista."});
  return new Response(eprCsv(report), {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ecotraceit-epr-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store"}});
}
