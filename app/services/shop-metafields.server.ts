type AdminClient = {
  graphql: (query: string, options?: {variables?: Record<string, unknown>}) => Promise<Response>;
};

export interface CheckoutConfig {
  checkoutBadgeEnabled: boolean;
  carbonNeutralEnabled: boolean;
  plan: string;
}

export async function syncCheckoutConfig(admin: AdminClient, config: CheckoutConfig, ownerId?: string) {
  let shopId = ownerId;
  if (!shopId) {
    const shopResponse = await admin.graphql("query EcoTraceITSettingsShop { shop { id } }");
    const shopJson = await shopResponse.json() as {data?: {shop?: {id?: string}}};
    shopId = shopJson.data?.shop?.id;
  }
  if (!shopId) throw new Error("Impossibile identificare lo shop Shopify");

  const response = await admin.graphql(
    "mutation EcoTraceITCheckoutConfig($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }",
    {variables: {metafields: [{
      ownerId: shopId,
      namespace: "$app:ecotraceit",
      key: "checkout_config",
      type: "json",
      value: JSON.stringify(config),
    }]}},
  );
  const json = await response.json() as {
    data?: {metafieldsSet?: {userErrors?: Array<{message: string}>}};
  };
  const errors = json.data?.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map((item) => item.message).join("; "));
}
