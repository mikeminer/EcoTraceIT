import type {LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {verifyActiveSubscription, type PlanHandle} from "../services/pricing.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session, admin} = await authenticate.admin(request);
  const url = new URL(request.url);
  const planHandle = url.searchParams.get("plan_handle");
  const allowed: PlanHandle[] = ["free", "pro", "enterprise"];
  let verification = "not-requested";
  if (planHandle && allowed.includes(planHandle as PlanHandle)) {
    if (planHandle === "free") {
      verification = "free";
    } else {
      const response = await admin.graphql("query EcoTraceITShopId { shop { id } }");
      const json = await response.json() as {data?: {shop?: {id?: string}}};
      const shopId = json.data?.shop?.id;
      const appId = process.env.SHOPIFY_APP_ID;
      if (!shopId || !appId) throw new Response("Billing verification configuration missing", {status: 503});
      const result = await verifyActiveSubscription(appId, shopId);
      if (!result.active) throw new Response("No active Shopify App Pricing subscription", {status: 402});
      verification = result.developmentBypass ? "development" : "partner-api";
    }
    await prisma.shopSettings.upsert({
      where: {shop: session.shop},
      create: {shop: session.shop, plan: planHandle},
      update: {plan: planHandle},
    });
  }
  const settings = await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  return {plan: settings.plan, verification};
};

export default function Pricing() {
  const {plan, verification} = useLoaderData<typeof loader>();
  return (
    <s-page heading="Piani EcoTraceIT">
      <s-banner tone="info">Piano attivo: {plan.toUpperCase()}. Verifica: {verification}.</s-banner>
      <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
        <s-section heading="Free"><s-heading>€0</s-heading><s-paragraph>100 ordini/mese, calcolo base e badge.</s-paragraph></s-section>
        <s-section heading="Pro"><s-heading>€29/mese</s-heading><s-paragraph>Report avanzati, offset e calcoli illimitati.</s-paragraph></s-section>
        <s-section heading="Enterprise"><s-heading>A consumo</s-heading><s-paragraph>Volumi elevati, tier graduati e supporto prioritario.</s-paragraph></s-section>
      </s-grid>
      <s-button href="shopify://admin/charges/ecotraceit/pricing_plans" variant="primary">Gestisci abbonamento su Shopify</s-button>
    </s-page>
  );
}
