export type PlanHandle = "free" | "pro" | "enterprise";
export const PLANS = {
  free: {name: "Free", orderLimit: 100, advancedReports: false, offset: false},
  pro: {name: "Pro", orderLimit: Infinity, advancedReports: true, offset: true},
  enterprise: {name: "Enterprise", orderLimit: Infinity, advancedReports: true, offset: true},
} as const;

export async function verifyActiveSubscription(appId: string, shopId: string) {
  const token = process.env.PARTNER_API_TOKEN;
  const organizationId = process.env.SHOPIFY_ORGANIZATION_ID;
  if (!token || !organizationId) {
    if (process.env.NODE_ENV === "production") throw new Error("Partner API configuration missing");
    return {active: true, developmentBypass: true};
  }
  const response = await fetch("https://partners.shopify.com/" + organizationId + "/api/2026-07/graphql.json", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: {"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
    body: JSON.stringify({
      query: "query ActiveSubscription($appId: ID!, $shopId: ID!) { activeSubscription(appId: $appId, shopId: $shopId) { billingPeriod cancelAtEndOfCycle items { handle } } }",
      variables: {appId, shopId},
    }),
  });
  if (!response.ok) throw new Error("Partner API returned " + response.status);
  const json = await response.json() as {data?: {activeSubscription?: unknown}; errors?: Array<{message: string}>};
  if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join("; "));
  return {active: Boolean(json.data?.activeSubscription), developmentBypass: false};
}