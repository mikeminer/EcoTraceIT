import type {HeadersFunction, LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {getDashboard} from "../services/analytics.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  return {dashboard: await getDashboard(session.shop), settings};
};

const kg = (value: number) => value.toLocaleString("it-IT", {maximumFractionDigits: 2});

export default function Dashboard() {
  const {dashboard, settings} = useLoaderData<typeof loader>();
  return (
    <s-page heading="EcoTraceIT">
      <s-button slot="primary-action" href="/app/settings">Configura</s-button>
      <s-section heading="Impatto ambientale">
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Emissioni totali</s-text>
            <s-heading>{kg(dashboard.totals.emissions)} kg CO₂e</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">CO₂e risparmiata</s-text>
            <s-heading>{kg(dashboard.totals.savings)} kg</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text color="subdued">Ordini analizzati</s-text>
            <s-heading>{dashboard.orderCount}</s-heading>
          </s-box>
        </s-grid>
      </s-section>
      <s-section heading="Ultimi 6 mesi">
        {dashboard.monthly.length === 0 ? (
          <s-banner tone="info">I dati appariranno dopo il primo ordine.</s-banner>
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
      <s-section heading="Prodotti a maggior impatto">
        {dashboard.products.map((product) => (
          <s-paragraph key={product.title}>{product.title}: {kg(product.emissions)} kg CO₂e ({product.quantity} unità)</s-paragraph>
        ))}
      </s-section>
      <s-section slot="aside" heading="Piano">
        <s-badge tone={settings.plan === "free" ? "info" : "success"}>{settings.plan.toUpperCase()}</s-badge>
        <s-paragraph>Checkout badge: {settings.checkoutBadgeEnabled ? "attivo" : "disattivato"}</s-paragraph>
        <s-link href="/app/pricing">Gestisci piano</s-link>
      </s-section>
      <s-section slot="aside" heading="PPWR">
        <s-paragraph>Le etichette sono suggerimenti operativi. Verifica sempre gli obblighi applicabili con il consulente compliance.</s-paragraph>
      </s-section>
    </s-page>
  );
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
