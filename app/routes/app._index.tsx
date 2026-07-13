import type {HeadersFunction, LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {getDashboard} from "../services/analytics.server";
import {getCopy} from "../i18n";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  return {dashboard: await getDashboard(session.shop), settings};
};

const kg = (value: number) => value.toLocaleString("it-IT", {maximumFractionDigits: 2});

export default function Dashboard() {
  const {dashboard, settings} = useLoaderData<typeof loader>();
  const t = getCopy(settings.locale);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyUsage = dashboard.monthly.find((row) => row.month === currentMonth)?.orders || 0;
  return (
    <s-page heading="EcoTraceIT">
      <s-button slot="primary-action" href="/app/settings">{t.configure}</s-button>
      <s-section heading={t.impact}>
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">{t.emissions}</s-text>
            <s-heading>{kg(dashboard.totals.emissions)} kg CO₂e</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">{t.savings}</s-text>
            <s-heading>{kg(dashboard.totals.savings)} kg</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">{t.orders}</s-text>
            <s-heading>{dashboard.orderCount}</s-heading>
          </s-box>
        </s-grid>
      </s-section>
      <s-section heading={t.history}>
        {settings.plan === "free" ? (
          <s-banner tone="info">{t.historyPro}</s-banner>
        ) : dashboard.monthly.length === 0 ? (
          <s-banner tone="info">{t.noData}</s-banner>
        ) : (
          <s-stack direction="block" gap="small">
            {dashboard.monthly.map((row) => (
              <s-box key={row.month} padding="small" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" gap="base">
                  <s-text>{row.month}</s-text>
                  <s-text>{row.orders} ordini</s-text>
                  <s-text>{kg(row.emissions)} kg CO₂e</s-text>
                  <s-text tone="success">−{kg(row.savings)} kg</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
      <s-section heading={t.products}>
        {settings.plan === "free" ? (
          <s-link href="/app/pricing">{t.productsPro}</s-link>
        ) : dashboard.products.map((product) => (
            <s-paragraph key={product.title}>{product.title}: {kg(product.emissions)} kg CO₂e ({product.quantity} unità)</s-paragraph>
          ))}
      </s-section>
      <s-section heading={t.categories}>
        {settings.plan === "free" ? (
          <s-paragraph>{t.categoriesPro}</s-paragraph>
        ) : dashboard.categories.map((category) => (
            <s-paragraph key={category.category}>{category.category}: {kg(category.emissions)} kg CO₂e ({category.quantity} unità)</s-paragraph>
          ))}
      </s-section>
      <s-section slot="aside" heading={t.plan}>
        <s-badge tone={settings.plan === "free" ? "info" : "success"}>{settings.plan.toUpperCase()}</s-badge>
        {settings.plan === "free" && <s-paragraph>{t.monthlyUsage}: {monthlyUsage}/{settings.monthlyOrderLimit}</s-paragraph>}
        <s-paragraph>{t.checkoutBadge}: {settings.checkoutBadgeEnabled ? t.active : t.inactive}</s-paragraph>
        <s-link href="/app/pricing">{t.managePlan}</s-link>
      </s-section>
      <s-section slot="aside" heading="PPWR">
        <s-paragraph>{t.ppwrNotice}</s-paragraph>
      </s-section>
    </s-page>
  );
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
