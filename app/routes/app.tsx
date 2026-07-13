import type {HeadersFunction, LoaderFunctionArgs} from "react-router";
import {Outlet, useLoaderData, useRouteError} from "react-router";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {AppProvider} from "@shopify/shopify-app-react-router/react";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";
import {getCopy} from "../i18n";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({where: {shop: session.shop}, create: {shop: session.shop}, update: {}});
  return {apiKey: process.env.SHOPIFY_API_KEY || "", locale: settings.locale};
};

export default function App() {
  const {apiKey, locale} = useLoaderData<typeof loader>();
  const t = getCopy(locale);
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">{t.navDashboard}</s-link>
        <s-link href="/app/settings">{t.navSettings}</s-link>
        <s-link href="/app/pricing">{t.navPlans}</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}
export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
