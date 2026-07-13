import type {ActionFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";
import {processOrder} from "../services/order.server";

export const action = async ({request}: ActionFunctionArgs) => {
  const {topic, shop, payload, admin} = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id") || crypto.randomUUID();
  try {
    await prisma.webhookReceipt.create({data: {id: webhookId, topic, shop}});
  } catch {
    return new Response(null, {status: 200});
  }
  try {
    await processOrder(shop, payload as never, admin || undefined);
    return new Response(null, {status: 200});
  } catch (error) {
    // The delivery was not completed: release the idempotency key so that
    // Shopify's retry can process the order instead of being discarded.
    await prisma.webhookReceipt.delete({where: {id: webhookId}}).catch(() => undefined);
    console.error(JSON.stringify({event: "order_webhook_failed", shop, topic, message: error instanceof Error ? error.message : "unknown"}));
    return new Response(null, {status: 500});
  }
};
