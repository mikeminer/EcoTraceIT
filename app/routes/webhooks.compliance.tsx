import type {ActionFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate} from "../shopify.server";

export const action = async ({request}: ActionFunctionArgs) => {
  const {topic, shop} = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    await prisma.$transaction([
      prisma.shopSettings.deleteMany({where: {shop}}),
      prisma.session.deleteMany({where: {shop}}),
      prisma.webhookReceipt.deleteMany({where: {shop}}),
    ]);
  }
  console.info(JSON.stringify({event: "compliance_webhook", topic, shop}));
  return new Response(null, {status: 200});
};
