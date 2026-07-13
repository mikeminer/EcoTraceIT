import prisma from "../db.server";
import {calculateCarbon} from "./carbon.server";
import {suggestPackaging} from "./packaging.server";
import {reserveOffset} from "./offset.server";

type ShopifyOrder = {
  admin_graphql_api_id?: string;
  id: number;
  name?: string;
  total_weight?: number;
  shipping_address?: {country_code?: string; zip?: string};
  shipping_lines?: Array<{title?: string}>;
  line_items?: Array<{product_id?: number; title?: string; quantity?: number}>;
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
  const baseline = carbon.emissionsKg + packaging.estimatedSavingsKg;
  await prisma.shopSettings.upsert({where: {shop}, create: {shop}, update: {}});
  const record = await prisma.sustainabilityOrder.upsert({
    where: {shop_orderGid: {shop, orderGid}},
    create: {
      shop, orderGid, orderName: payload.name,
      countryCode: payload.shipping_address?.country_code,
      postalCodePrefix: payload.shipping_address?.zip?.slice(0, 2),
      weightGrams, carrier, distanceKm: carbon.distanceKm,
      emissionsKg: carbon.emissionsKg, baselineEmissionsKg: baseline,
      savingsKg: packaging.estimatedSavingsKg, packagingCode: packaging.code,
    },
    update: {
      weightGrams, carrier, distanceKm: carbon.distanceKm,
      emissionsKg: carbon.emissionsKg, baselineEmissionsKg: baseline,
      savingsKg: packaging.estimatedSavingsKg, packagingCode: packaging.code,
    },
  });
  const offsetSelected = payload.note_attributes?.some((attribute) =>
    attribute.name === "_ecopack_carbon_neutral" && attribute.value === "true",
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
  if (lines.length) {
    await prisma.productStat.createMany({data: lines.map((line) => ({
      orderId: record.id,
      productGid: line.product_id ? "gid://shopify/Product/" + line.product_id : null,
      title: line.title || "Product",
      quantity: line.quantity || 1,
      allocatedEmissionsKg: carbon.emissionsKg * (line.quantity || 1) / totalQuantity,
    }))});
  }
  if (admin && typeof admin === "object" && "graphql" in admin) {
    const graphql = (admin as {
      graphql: (query: string, options: {variables: Record<string, unknown>}) => Promise<Response>;
    }).graphql;
    const productMetafields = lines
      .filter((line) => line.product_id)
      .map((line) => ({
        ownerId: "gid://shopify/Product/" + line.product_id,
        namespace: "ecopack_ai",
        key: "last_order_co2_kg",
        type: "number_decimal",
        value: String(Math.round(carbon.emissionsKg * (line.quantity || 1) / totalQuantity * 1000) / 1000),
      }));
    const response = await graphql(
      "mutation EcoPackMetafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }",
      {variables: {metafields: [
        {ownerId: orderGid, namespace: "ecopack_ai", key: "co2_kg", type: "number_decimal", value: String(carbon.emissionsKg)},
        {ownerId: orderGid, namespace: "ecopack_ai", key: "packaging", type: "single_line_text_field", value: packaging.code},
        ...productMetafields,
      ]}},
    );
    const json = await response.json() as {data?: {metafieldsSet?: {userErrors?: Array<{message: string}>}}};
    const errors = json.data?.metafieldsSet?.userErrors || [];
    if (errors.length) console.error(JSON.stringify({event: "metafield_error", shop, errors}));
  }
  return {record, carbon, packaging};
}
