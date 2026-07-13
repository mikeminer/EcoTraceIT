let cachedToken: {value: string; expiresAt: number} | undefined;

async function getAppEventsToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify App Events credentials missing");
  const response = await fetch("https://api.shopify.com/auth/access_token", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials"}),
  });
  if (!response.ok) throw new Error("Shopify App Events authentication returned " + response.status);
  const data = await response.json() as {access_token?: string; expires_in?: number};
  if (!data.access_token) throw new Error("Shopify App Events token missing");
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

export async function reportOrderProcessed(shopId: string, orderGid: string, weightGrams: number, emissionsKg: number) {
  const token = await getAppEventsToken();
  const orderId = orderGid.split("/").at(-1) || orderGid;
  const response = await fetch("https://api.shopify.com/app/unstable/events", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
    body: JSON.stringify({
      shop_id: shopId,
      event_handle: process.env.APP_EVENTS_ORDER_HANDLE || "order_processed",
      timestamp: new Date().toISOString(),
      idempotency_key: ("order_processed_" + orderId).slice(0, 64),
      attributes: {
        value: 1,
        weight_kg: Math.round(weightGrams / 10) / 100,
        co2_kg: emissionsKg,
      },
    }),
  });
  if (!response.ok) throw new Error("Shopify App Events API returned " + response.status);
}
