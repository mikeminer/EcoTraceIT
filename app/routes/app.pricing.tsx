import type {LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {verifyActiveSubscription, type PlanHandle} from "../services/pricing.server";
import {syncCheckoutConfig} from "../services/shop-metafields.server";
import {getCopy} from "../i18n";

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
      const result = await verifyActiveSubscription(appId, shopId, planHandle as PlanHandle);
      if (!result.active) throw new Response("The active Shopify App Pricing subscription does not match the selected plan", {status: 402});
      verification = result.developmentBypass ? "development" : "partner-api";
    }
    await prisma.shopSettings.upsert({
      where: {shop: session.shop},
      create: {shop: session.shop, plan: planHandle},
      update: {plan: planHandle},
    });
  }
  const settings = await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  await syncCheckoutConfig(admin, {
    checkoutBadgeEnabled: settings.checkoutBadgeEnabled,
    carbonNeutralEnabled: settings.plan !== "free" && settings.carbonNeutralEnabled,
    plan: settings.plan,
  });
  return {plan: settings.plan, verification, locale: settings.locale};
};

export default function Pricing() {
  const {plan, verification, locale} = useLoaderData<typeof loader>();
  const t = getCopy(locale);
  return (
    <s-page heading={t.pricing}>
      <s-banner tone="info">{t.activePlan}: {plan.toUpperCase()}. {t.verification}: {verification}.</s-banner>
      <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
        <s-section heading="Free"><s-heading>€0</s-heading><s-paragraph>{t.freeDescription}</s-paragraph></s-section>
        <s-section heading="Pro"><s-heading>€29/mese</s-heading><s-paragraph>{t.proDescription}</s-paragraph></s-section>
        <s-section heading="Enterprise"><s-heading>{t.usage}</s-heading><s-paragraph>{t.enterpriseDescription}</s-paragraph></s-section>
      </s-grid>
      <s-button href="shopify://admin/charges/ecotraceit/pricing_plans" variant="primary">{t.manageShopify}</s-button>
    </s-page>
  );
}
