import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  return prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
};

export const action = async ({request}: ActionFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const price = Number(form.get("carbonPricePerKg"));
  if (!Number.isFinite(price) || price < 0 || price > 20) return {ok: false, error: "Prezzo offset non valido"};
  await prisma.shopSettings.upsert({
    where: {shop: session.shop},
    create: {shop: session.shop, carbonPricePerKg: price},
    update: {
      locale: form.get("locale") === "en" ? "en" : "it",
      defaultCarrier: String(form.get("defaultCarrier") || "standard"),
      carbonPricePerKg: price,
      checkoutBadgeEnabled: form.get("checkoutBadgeEnabled") === "on",
      carbonNeutralEnabled: form.get("carbonNeutralEnabled") === "on",
    },
  });
  return {ok: true};
};

export default function Settings() {
  const settings = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="Impostazioni">
      {result?.ok && <s-banner tone="success">Impostazioni salvate.</s-banner>}
      {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
      <Form method="post">
        <s-section heading="Checkout">
          <s-checkbox name="checkoutBadgeEnabled" defaultChecked={settings.checkoutBadgeEnabled} label="Mostra stima CO₂e al checkout" />
          <s-checkbox name="carbonNeutralEnabled" defaultChecked={settings.carbonNeutralEnabled} label="Abilita opzione Carbon Neutral (Pro)" />
          <s-select name="defaultCarrier" label="Corriere predefinito" value={settings.defaultCarrier}>
            <s-option value="standard">Standard</s-option><s-option value="express">Express</s-option>
            <s-option value="ev">Elettrico</s-option><s-option value="bike">Bici</s-option><s-option value="air">Aereo</s-option>
          </s-select>
          <s-number-field name="carbonPricePerKg" label="Prezzo offset per kg (EUR)" value={String(settings.carbonPricePerKg)} min={0} max={20} step={0.01} />
        </s-section>
        <s-section heading="Lingua e privacy">
          <s-select name="locale" label="Lingua" value={settings.locale}>
            <s-option value="it">Italiano</s-option><s-option value="en">English</s-option>
          </s-select>
          <s-paragraph>EcoPack AI conserva solo CAP abbreviato, paese, peso e riferimenti tecnici dell&apos;ordine. Nessun nome, email o indirizzo completo.</s-paragraph>
        </s-section>
        <s-button slot="primary-action" type="submit" variant="primary">Salva</s-button>
      </Form>
    </s-page>
  );
}
