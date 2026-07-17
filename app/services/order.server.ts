import prisma from "../db.server";
import {calculateCarbon} from "./carbon.server";
import {suggestPackaging} from "./packaging.server";
import {reserveOffset} from "./offset.server";
import {reportOrderProcessed} from "./app-events.server";
import {PLANS, type PlanHandle} from "./pricing.server";
import {selectRightSizedPackaging, type ProductDimensions} from "./right-sizing.server";

type ShopifyOrder = {
  admin_graphql_api_id?: string;
  id: number;
  name?: string;
  total_weight?: number;
  shipping_address?: {country_code?: string; zip?: string};
  shipping_lines?: Array<{title?: string}>;
  line_items?: Array<{product_id?: number; title?: string; quantity?: number; grams?: number}>;
  note_attributes?: Array<{name?: string; value?: string}>;
};

function detectCarrier(order: ShopifyOrder) {
  const title = order.shipping_lines?.[0]?.title?.toLowerCase() || "";
  if (title.includes("express")) return "express";
  if (title.includes("air")) return "air";
  if (title.includes("bike") || title.includes("bici")) return "bike";
  if (title.includes("electric") || title.includes("elettric")) return "ev";
  return "standard";
}

export async function processOrder(shop: string, payload: ShopifyOrder, admin?: unknown) {
  const orderGid = payload.admin_graphql_api_id || "gid://shopify/Order/" + payload.id;
  const graphql = admin && typeof admin === "object" && "graphql" in admin
    ? (admin as {graphql: (query: string, options: {variables: Record<string, unknown>}) => Promise<Response>}).graphql
    : undefined;
  const settings = await prisma.shopSettings.upsert({where: {shop}, create: {shop}, update: {}});
  const existingOrder = await prisma.sustainabilityOrder.findUnique({
    where: {shop_orderGid: {shop, orderGid}},
    select: {id: true},
  });
  const plan = PLANS[settings.plan as PlanHandle] || PLANS.free;
  if (!existingOrder && Number.isFinite(plan.orderLimit)) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthlyOrders = await prisma.sustainabilityOrder.count({
      where: {shop, calculatedAt: {gte: monthStart}},
    });
    if (monthlyOrders >= plan.orderLimit) {
      console.info(JSON.stringify({event: "plan_limit_reached", shop, plan: settings.plan, orderGid, monthlyOrders}));
      return {skipped: true as const, reason: "monthly_order_limit" as const};
    }
  }
  const weightGrams = Math.max(100, payload.total_weight || 1000);
  const carrier = detectCarrier(payload);
  const carbon = await calculateCarbon({
    weightGrams,
    destinationCountry: payload.shipping_address?.country_code,
    postalCode: payload.shipping_address?.zip,
    carrier,
  });
  const packaging = suggestPackaging({
    weightGrams,
    itemCount: payload.line_items?.reduce((sum, line) => sum + (line.quantity || 1), 0) || 1,
  });
  let packagingProfile = await prisma.packagingProfile.findFirst({
    where: {shop, uniqueIdentifier: packaging.code, status: "DECLARED"},
    orderBy: {version: "desc"},
    select: {id: true, declarationNumber: true, version: true, uniqueIdentifier: true},
  });
  const baseline = carbon.emissionsKg + packaging.estimatedSavingsKg;
  const record = await prisma.sustainabilityOrder.upsert({
    where: {shop_orderGid: {shop, orderGid}},
    create: {
      shop, orderGid, orderName: payload.name,
      countryCode: payload.shipping_address?.country_code,
      postalCodePrefix: payload.shipping_address?.zip?.slice(0, 2),
      weightGrams, carrier, distanceKm: carbon.distanceKm,
      emissionsKg: carbon.emissionsKg, baselineEmissionsKg: baseline,
      savingsKg: packaging.estimatedSavingsKg, packagingCode: packaging.code,
      packagingProfileId: packagingProfile?.id,
    },
    update: {
      weightGrams, carrier, distanceKm: carbon.distanceKm,
      emissionsKg: carbon.emissionsKg, baselineEmissionsKg: baseline,
      savingsKg: packaging.estimatedSavingsKg, packagingCode: packaging.code,
      packagingProfileId: packagingProfile?.id,
    },
  });
  const offsetSelected = payload.note_attributes?.some((attribute) =>
    attribute.name === "_ecotraceit_carbon_neutral" && attribute.value === "true",
  ) || false;
  if (offsetSelected) {
    try {
      const offset = await reserveOffset(orderGid, carbon.emissionsKg);
      await prisma.sustainabilityOrder.update({
        where: {id: record.id},
        data: {offsetSelected: true, offsetAmount: offset.amount},
      });
    } catch (error) {
      console.error(JSON.stringify({event: "offset_reservation_failed", shop, orderGid, message: error instanceof Error ? error.message : "unknown"}));
    }
  }
  await prisma.productStat.deleteMany({where: {orderId: record.id}});
  const lines = payload.line_items || [];
  const totalQuantity = Math.max(1, lines.reduce((sum, line) => sum + (line.quantity || 1), 0));
  const productCategories = new Map<string, string>();
  const productDimensions = new Map<string, Omit<ProductDimensions, "quantity">>();
  if (graphql) {
    const productIds = [...new Set(lines.flatMap((line) => line.product_id ? ["gid://shopify/Product/" + line.product_id] : []))];
    if (productIds.length) {
      const categoryResponse = await graphql(
        `query EcoTraceITProductCategories($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              productType
              category { fullName }
              length: metafield(namespace: "$app:ecotraceit", key: "length_mm") { value }
              width: metafield(namespace: "$app:ecotraceit", key: "width_mm") { value }
              height: metafield(namespace: "$app:ecotraceit", key: "height_mm") { value }
            }
          }
        }`,
        {variables: {ids: productIds}},
      );
      const categoryJson = await categoryResponse.json() as {
        data?: {nodes?: Array<{
          id?: string;
          productType?: string;
          category?: {fullName?: string};
          length?: {value?: string} | null;
          width?: {value?: string} | null;
          height?: {value?: string} | null;
        } | null>};
        errors?: Array<{message: string}>;
      };
      if (categoryJson.errors?.length) {
        console.warn(JSON.stringify({event: "product_category_lookup_failed", shop, errors: categoryJson.errors}));
      }
      for (const product of categoryJson.data?.nodes || []) {
        if (product?.id) {
          productCategories.set(product.id, product.category?.fullName || product.productType || "Non categorizzato");
          const lengthMm = Number(product.length?.value) || 0;
          const widthMm = Number(product.width?.value) || 0;
          const heightMm = Number(product.height?.value) || 0;
          if (lengthMm > 0 && widthMm > 0 && heightMm > 0) productDimensions.set(product.id, {lengthMm, widthMm, heightMm});
        }
      }
    }
  }
  if (productDimensions.size) {
    const dimensionalItems = lines.flatMap((line) => {
      const dimensions = line.product_id ? productDimensions.get("gid://shopify/Product/" + line.product_id) : undefined;
      return dimensions ? [{...dimensions, quantity: line.quantity || 1}] : [];
    });
    if (dimensionalItems.length === lines.filter((line) => line.product_id).length) {
      const candidates = await prisma.packagingProfile.findMany({
        where: {shop, status: "DECLARED"},
        select: {id: true, declarationNumber: true, version: true, uniqueIdentifier: true, lengthMm: true, widthMm: true, heightMm: true, productVolumeCm3: true, packagingWeightGrams: true, isReusable: true},
      });
      const rightSized = selectRightSizedPackaging(dimensionalItems, candidates);
      if (rightSized.selected) {
        packagingProfile = rightSized.selected;
        await prisma.sustainabilityOrder.update({where: {id: record.id}, data: {packagingProfileId: rightSized.selected.id, packagingCode: rightSized.selected.uniqueIdentifier}});
        console.info(JSON.stringify({event: "right_sizing_selected", shop, orderGid, profile: rightSized.selected.uniqueIdentifier, emptySpaceRatio: rightSized.emptySpaceRatio}));
      }
    }
  }
  if (lines.length) {
    await prisma.productStat.createMany({data: lines.map((line) => ({
      orderId: record.id,
      productGid: line.product_id ? "gid://shopify/Product/" + line.product_id : null,
      title: line.title || "Product",
      category: line.product_id ? productCategories.get("gid://shopify/Product/" + line.product_id) || "Non categorizzato" : "Non categorizzato",
      quantity: line.quantity || 1,
      allocatedEmissionsKg: carbon.emissionsKg * (line.quantity || 1) / totalQuantity,
    }))});
  }
  if (graphql) {
    const productImpacts = new Map<string, {emissionsKg: number; weightGrams: number}>();
    for (const line of lines) {
      if (!line.product_id) continue;
      const productGid = "gid://shopify/Product/" + line.product_id;
      const quantity = line.quantity || 1;
      const existing = productImpacts.get(productGid) || {emissionsKg: 0, weightGrams: 0};
      productImpacts.set(productGid, {
        emissionsKg: existing.emissionsKg + carbon.emissionsKg * quantity / totalQuantity,
        weightGrams: Math.max(existing.weightGrams, line.grams || Math.round(weightGrams / totalQuantity), 1),
      });
    }
    const productMetafields = [...productImpacts.entries()].flatMap(([productGid, impact]) => [
        {
          ownerId: productGid,
          namespace: "ecotraceit",
          key: "co2_kg",
          type: "number_decimal",
          value: String(Math.round(impact.emissionsKg * 1000) / 1000),
        },
        {
          ownerId: productGid,
          namespace: "$app:ecotraceit",
          key: "weight_grams",
          type: "number_integer",
          value: String(impact.weightGrams),
        },
      ]);
    const metafields = [
        {ownerId: orderGid, namespace: "ecotraceit", key: "co2_kg", type: "number_decimal", value: String(carbon.emissionsKg)},
        {ownerId: orderGid, namespace: "ecotraceit", key: "packaging", type: "single_line_text_field", value: packaging.code},
        {ownerId: orderGid, namespace: "ecotraceit", key: "packaging_label", type: "single_line_text_field", value: packaging.icon + " " + (settings.locale === "en" ? packaging.labelEn : packaging.labelIt)},
        {ownerId: orderGid, namespace: "ecotraceit", key: "packaging_material", type: "single_line_text_field", value: packaging.material},
        {ownerId: orderGid, namespace: "ecotraceit", key: "carbon_neutral", type: "boolean", value: String(offsetSelected)},
        {ownerId: orderGid, namespace: "ecotraceit", key: "calculation_method", type: "single_line_text_field", value: carbon.method},
        ...(packagingProfile ? [
          {ownerId: orderGid, namespace: "ecotraceit", key: "ppwr_profile", type: "single_line_text_field", value: `${packagingProfile.uniqueIdentifier}:v${packagingProfile.version}`},
          {ownerId: orderGid, namespace: "ecotraceit", key: "ppwr_declaration", type: "single_line_text_field", value: packagingProfile.declarationNumber || ""},
        ] : []),
        ...productMetafields,
      ];
    // metafieldsSet accepts at most 25 entries. Batch large orders and fail the
    // webhook delivery if Shopify rejects a batch so its retry can complete it.
    for (let index = 0; index < metafields.length; index += 25) {
      const response = await graphql(
        "mutation EcoTraceITMetafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }",
        {variables: {metafields: metafields.slice(index, index + 25)}},
      );
      const json = await response.json() as {
        data?: {metafieldsSet?: {userErrors?: Array<{message: string}>}};
        errors?: Array<{message: string}>;
      };
      const errors = [...(json.errors || []), ...(json.data?.metafieldsSet?.userErrors || [])];
      if (errors.length) {
        console.error(JSON.stringify({event: "metafield_error", shop, errors}));
        throw new Error("Shopify rejected EcoTraceIT metafields");
      }
    }
    if (settings.plan === "enterprise") {
      const shopResponse = await graphql("query EcoTraceITAppEventShop { shop { id } }", {variables: {}});
      const shopJson = await shopResponse.json() as {data?: {shop?: {id?: string}}};
      const shopId = shopJson.data?.shop?.id;
      if (!shopId) throw new Error("Shopify shop ID missing for Enterprise usage event");
      await reportOrderProcessed(shopId, orderGid, weightGrams, carbon.emissionsKg);
    }
  } else if (settings.plan === "enterprise") {
    throw new Error("Shopify admin client missing for Enterprise usage event");
  }
  return {record, carbon, packaging};
}
