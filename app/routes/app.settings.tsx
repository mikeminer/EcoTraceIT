import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {syncCheckoutConfig} from "../services/shop-metafields.server";
import {getCopy} from "../i18n";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  return prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
};

export const action = async ({request}: ActionFunctionArgs) => {
  const {session, admin} = await authenticate.admin(request);
  const form = await request.formData();
  const price = Number(form.get("carbonPricePerKg"));
  if (!Number.isFinite(price) || price < 0 || price > 20) return {ok: false, error: "Prezzo offset non valido"};
  const current = await prisma.shopSettings.upsert({
    where: {shop: session.shop},
    create: {shop: session.shop},
    update: {},
  });
  const checkoutBadgeEnabled = form.get("checkoutBadgeEnabled") === "on";
  const carbonNeutralEnabled = ["pro", "enterprise"].includes(current.plan) && form.get("carbonNeutralEnabled") === "on";
  try {
    await syncCheckoutConfig(admin, {checkoutBadgeEnabled, carbonNeutralEnabled, plan: current.plan});
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : "Errore di sincronizzazione Shopify"};
  }
  await prisma.shopSettings.upsert({
    where: {shop: session.shop},
    create: {shop: session.shop, carbonPricePerKg: price},
    update: {
      locale: form.get("locale") === "en" ? "en" : "it",
      defaultCarrier: String(form.get("defaultCarrier") || "standard"),
      carbonPricePerKg: price,
      checkoutBadgeEnabled,
      carbonNeutralEnabled,
    },
  });
  return {ok: true};
};

export default function Settings() {
  const settings = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const t = getCopy(settings.locale);
  const carbonNeutralAvailable = ["pro", "enterprise"].includes(settings.plan);
  return (
    <s-page heading={t.settings}>
      {result?.ok && <s-banner tone="success">{t.saved}</s-banner>}
      {result?.error && <s-banner tone="critical">{result.error}</s-banner>}
      <Form method="post">
        <s-section heading={t.checkout}>
          <s-checkbox name="checkoutBadgeEnabled" defaultChecked={settings.checkoutBadgeEnabled} label={t.showEstimate} />
          <s-checkbox name="carbonNeutralEnabled" defaultChecked={settings.carbonNeutralEnabled} disabled={!carbonNeutralAvailable} label={t.enableNeutral} />
          {!carbonNeutralAvailable && <s-banner tone="info">{t.neutralPro}</s-banner>}
          <s-select name="defaultCarrier" label={t.defaultCarrier} value={settings.defaultCarrier}>
            <s-option value="standard">Standard</s-option><s-option value="express">Express</s-option>
            <s-option value="ev">Elettrico</s-option><s-option value="bike">Bici</s-option><s-option value="air">Aereo</s-option>
          </s-select>
          <s-number-field name="carbonPricePerKg" label={t.offsetPrice} value={String(settings.carbonPricePerKg)} min={0} max={20} step={0.01} />
        </s-section>
        <s-section heading={t.languagePrivacy}>
          <s-select name="locale" label={t.language} value={settings.locale}>
            <s-option value="it">Italiano</s-option><s-option value="en">English</s-option>
          </s-select>
          <s-paragraph>{t.privacy}</s-paragraph>
        </s-section>
        <s-button slot="primary-action" type="submit" variant="primary">{t.save}</s-button>
      </Form>
    </s-page>
  );
}
